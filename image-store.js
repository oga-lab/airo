/* ============================================================
   image-store.js
   あいろの画像保存庫（IndexedDB）

   このファイルが提供する関数：
     - putImage(blob)        画像を保存して ID を返す
     - getImageUrl(id)       ID から表示用URLを取り出す
     - deleteImage(id)       ID指定で削除
     - revokeImageUrl(url)   表示用URLの後片付け
     - fileToResizedBlob(file, maxSize, quality)
                             ファイルをリサイズしてBlobで返す
     - imageStoreReady()     初期化を待つ（毎回呼んでOK）
     - blobToBase64(blob)    バックアップ書き出し用
     - base64ToBlob(base64)  バックアップ読み込み用

   使い方の流れ：
     1) 画像入力 → fileToResizedBlob() でリサイズ
     2) putImage(blob) で保存して ID をもらう
     3) ログには ID だけ持たせる
     4) 表示するときは getImageUrl(id) で URL もらって img.src に
     5) ログ削除と同時に deleteImage(id)
============================================================ */

(function () {
  const DB_NAME = "airoImageDB";
  const DB_VERSION = 1;
  const STORE_NAME = "images";

  let dbPromise = null;

  /* ---------- DB 初期化 ---------- */
  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      req.onsuccess = function (e) {
        resolve(e.target.result);
      };

      req.onerror = function (e) {
        console.error("IndexedDB open failed", e);
        reject(e);
      };
    });

    return dbPromise;
  }

  /* ---------- ID 生成 ---------- */
  function genImageId() {
    return "img_" + Date.now().toString(36) + "_" +
           Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 保存 ---------- */
  async function putImage(blob, id) {
    const db = await openDB();
    const imageId = id || genImageId();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ id: imageId, blob: blob });

      tx.oncomplete = () => resolve(imageId);
      tx.onerror = (e) => reject(e);
    });
  }

  /* ---------- 取得（Blob） ---------- */
  async function getImageBlob(id) {
    if (!id) return null;
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        const result = req.result;
        resolve(result ? result.blob : null);
      };
      req.onerror = (e) => reject(e);
    });
  }

  /* ---------- 取得（表示用URL） ---------- */
  async function getImageUrl(id) {
    const blob = await getImageBlob(id);
    if (!blob) return "";
    return URL.createObjectURL(blob);
  }

  /* ---------- 表示用URLの解放 ---------- */
  function revokeImageUrl(url) {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }

  /* ---------- 削除 ---------- */
  async function deleteImage(id) {
    if (!id) return;
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  /* ---------- リサイズ ---------- */
  // File → リサイズ済み Blob
  // 長辺を maxSize に揃え、JPEG quality で書き出す
  function fileToResizedBlob(file, maxSize = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function (e) {
        const img = new Image();

        img.onload = function () {
          let w = img.width;
          let h = img.height;

          if (w > h && w > maxSize) {
            h = h * (maxSize / w);
            w = maxSize;
          } else if (h > maxSize) {
            w = w * (maxSize / h);
            h = maxSize;
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("toBlob failed"));
            },
            "image/jpeg",
            quality
          );
        };

        img.onerror = () => reject(new Error("image load failed"));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error("file read failed"));
      reader.readAsDataURL(file);
    });
  }

  /* ---------- バックアップ用：Blob ↔ base64 ---------- */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // "data:image/jpeg;base64,..."
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(dataUrl) {
    // "data:image/jpeg;base64,xxxx" を Blob に
    const parts = dataUrl.split(",");
    const meta = parts[0]; // "data:image/jpeg;base64"
    const b64 = parts[1] || "";
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

    const bin = atob(b64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }

  /* ---------- 公開 ---------- */
  window.imageStore = {
    putImage,
    getImageBlob,
    getImageUrl,
    revokeImageUrl,
    deleteImage,
    fileToResizedBlob,
    blobToBase64,
    base64ToBlob,
    ready: openDB
  };
})();
