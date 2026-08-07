import { supabase } from '../lib/supabaseClient.js'

// 휴대폰 원본 사진은 수 MB라 무료 용량(1GB)을 금방 채운다.
// 긴 변 기준으로 줄여 JPEG로 재인코딩한다. 실패하면 원본 그대로 올린다.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return blob ?? file
  } catch {
    // HEIC 등 디코딩이 안 되는 포맷은 원본 그대로
    return file
  }
}

/** 사진 한 장을 Supabase Storage(photos 버킷)에 올리고 공개 URL을 반환한다. */
export async function uploadPhoto(file) {
  const compressed = await compressImage(file)
  const isJpeg = compressed !== file
  const ext = isJpeg ? 'jpg' : file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('photos').upload(path, compressed, {
    contentType: isJpeg ? 'image/jpeg' : file.type || undefined,
  })
  if (error) throw error
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
}
