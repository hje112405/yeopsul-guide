import { supabase } from "./supabase";
import { removeReviewImages } from "./reviewImages";

export async function deleteOwnReview(review, userId) {
  if (!review || review.user_id !== userId) {
    throw new Error("삭제할 수 있는 본인 리뷰가 아닙니다.");
  }

  const { data, error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", review.id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`리뷰를 삭제하지 못했습니다: ${error.message}`);
  if (!data) throw new Error("삭제할 수 있는 본인 리뷰를 찾지 못했습니다.");

  let imageCleanupError = null;

  if (review.review_images?.length > 0) {
    try {
      await removeReviewImages(review.review_images);
    } catch (error) {
      imageCleanupError = error;
    }
  }

  return { imageCleanupError };
}
