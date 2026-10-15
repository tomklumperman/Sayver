import { File, UploadType } from 'expo-file-system';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseStorage } from './config';

function normalizeExtension(uri = '') {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (!match) return 'jpg';
  return match[1].toLowerCase();
}

async function uriToBlob(uri) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read selected image file.');
  }
  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error('The selected image file is empty or unavailable.');
  }
  return blob;
}

async function uploadLocalFile(storageRef, uri, contentType) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in before uploading an image.');

  const file = new File(uri);
  if (!file.exists || !file.size) {
    throw new Error('The selected image file is empty or unavailable.');
  }

  const idToken = await user.getIdToken();
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageRef.bucket)}/o?uploadType=media&name=${encodeURIComponent(storageRef.fullPath)}`;
  const result = await file.upload(uploadUrl, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: contentType,
    headers: { Authorization: `Firebase ${idToken}` },
  });

  if (result.status < 200 || result.status >= 300) {
    let serverMessage = '';
    try {
      serverMessage = JSON.parse(result.body)?.error?.message || '';
    } catch (_error) {}
    throw new Error(`Firebase Storage upload failed (HTTP ${result.status})${serverMessage ? `: ${serverMessage}` : '.'}`);
  }
}

export function isLocalImageUri(uri) {
  return typeof uri === 'string' && /^(file|content|ph|assets-library):\/\//i.test(uri);
}

export async function uploadCardImage(userId, uri, scope = 'accounts') {
  if (!userId) {
    throw new Error('User ID is required to upload card images.');
  }
  if (!uri) {
    return null;
  }

  const storage = getFirebaseStorage();
  const extension = normalizeExtension(uri);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const storageRef = ref(storage, `users/${userId}/${scope}/${fileName}`);
  const contentType = `image/${extension}`;
  if (isLocalImageUri(uri)) {
    await uploadLocalFile(storageRef, uri, contentType);
  } else {
    const blob = await uriToBlob(uri);
    await uploadBytes(storageRef, blob, { contentType: blob.type || contentType });
  }

  return await getDownloadURL(storageRef);
}

export async function uploadLocalImageIfNeeded(userId, uri, scope) {
  if (!uri) return null;
  return isLocalImageUri(uri) ? uploadCardImage(userId, uri, scope) : uri;
}
