import { supabase } from '../supabaseClient';

export async function uploadImageToStorage(file, folder = 'items') {
  if (!file) return null;

  // Validação de tamanho (máximo 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 5MB.');
  }

  // Validação de tipo
  if (!file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem válida.');
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('quotation-images')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from('quotation-images').getPublicUrl(fileName);
  return data.publicUrl;
}
