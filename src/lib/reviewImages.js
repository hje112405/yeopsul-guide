import { supabase } from "./supabase";

export const REVIEW_IMAGE_BUCKET = "review-images";
export const MAX_REVIEW_IMAGES = 3;
export const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_REVIEW_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function getFileExtension(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension?.replace(/[^a-z0-9]/g, "") || "jpg";
}

export function getReviewImagePath(imageUrl) {
  if (imageUrl.startsWith("reviews/")) return imageUrl;

  const publicPath = `/storage/v1/object/public/${REVIEW_IMAGE_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(publicPath);

  if (markerIndex === -1) return null;

  return decodeURIComponent(imageUrl.slice(markerIndex + publicPath.length));
}

export async function uploadReviewImage({ file, userId, reviewId, order }) {
  const fileName = `${crypto.randomUUID()}.${getFileExtension(file)}`;
  const storagePath = `reviews/${userId}/${reviewId}/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from(REVIEW_IMAGE_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(REVIEW_IMAGE_BUCKET)
    .getPublicUrl(storagePath);
  const { data, error: imageRowError } = await supabase
    .from("review_images")
    .insert({
      review_id: reviewId,
      image_url: publicUrlData.publicUrl,
      display_order: order,
    })
    .select("id, review_id, image_url, created_at, display_order")
    .single();

  if (imageRowError) {
    await supabase.storage.from(REVIEW_IMAGE_BUCKET).remove([storagePath]);
    throw imageRowError;
  }

  return data;
}

export async function removeReviewImages(images) {
  const paths = images
    .map((image) => getReviewImagePath(image.image_url))
    .filter(Boolean);

  if (paths.length === 0) return;

  const { error } = await supabase.storage
    .from(REVIEW_IMAGE_BUCKET)
    .remove(paths);

  if (error) throw error;
}
