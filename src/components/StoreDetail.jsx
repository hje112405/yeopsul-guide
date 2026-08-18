import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { deleteOwnReview } from "../lib/reviews";
import { calculateStoreAwards } from "../lib/awards";
import "./StoreDetail.css";

function formatAverage(average) {
  return average === null ? "평가 없음" : average.toFixed(1);
}

function formatReviewDate(createdAt) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";

  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, "0")))
    .join(".");
}

function ReviewCard({
  review,
  isOwnReview,
  isLiked,
  likeCount,
  isChangingLike,
  onToggleLike,
  onEdit,
  onDelete,
}) {
  const ratings = [
    review.cheese_rating !== null ? `치즈 ${review.cheese_rating}` : null,
    review.sauce_rating !== null ? `소스 ${review.sauce_rating}` : null,
    review.cooking_rating !== null ? `익힘 ${review.cooking_rating}` : null,
  ].filter(Boolean);

  return (
    <article className="review-card">
      <div className="review-card-heading">
        <strong>{review.profiles?.nickname ?? "작성자 정보 없음"}</strong>
        <div className="review-card-meta">
          <time dateTime={review.created_at}>
            {formatReviewDate(review.created_at)}
          </time>
          {isOwnReview && (
            <div className="review-card-actions">
              <button type="button" onClick={() => onEdit(review)}>수정</button>
              <button type="button" onClick={() => onDelete(review)}>삭제</button>
            </div>
          )}
        </div>
      </div>
      <p className="review-menu">{review.menu}</p>
      {ratings.length > 0 && <p className="review-ratings-text">{ratings.join(" · ")}</p>}
      {review.content && <p className="review-content">{review.content}</p>}
      {review.review_images?.length > 0 && (
        <div className={`review-card-images count-${review.review_images.length}`}>
          {review.review_images.map((image) => (
            <img key={image.id} src={image.image_url} alt="리뷰 음식 사진" />
          ))}
        </div>
      )}
      <button
        type="button"
        className={`review-like-button ${isLiked ? "is-liked" : ""}`}
        onClick={() => onToggleLike(review)}
        disabled={isChangingLike}
        aria-label={isLiked ? "리뷰 좋아요 취소" : "리뷰 좋아요"}
        aria-pressed={isLiked}
      >
        <span aria-hidden="true">{isLiked ? "♥" : "♡"}</span>
        {likeCount}
      </button>
    </article>
  );
}

function StoreDetail({
  store,
  onBack,
  onWriteReview,
  onEditReview,
  message,
  reviewRefreshKey,
  onReviewsChanged,
  user,
}) {
  const [isSaved, setIsSaved] = useState(false);
  const [isCheckingSaved, setIsCheckingSaved] = useState(
    Boolean(user && store.id),
  );
  const [isChangingSaved, setIsChangingSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(Boolean(store.id));
  const [reviewError, setReviewError] = useState("");
  const [reviewRefreshCounter, setReviewRefreshCounter] = useState(0);
  const [reviewToDelete, setReviewToDelete] = useState(null);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reviewLikes, setReviewLikes] = useState([]);
  const [changingLikeIds, setChangingLikeIds] = useState([]);
  const [likeMessage, setLikeMessage] = useState("");
  const [reviewSort, setReviewSort] = useState("latest");
  const [reviewImages, setReviewImages] = useState([]);

  useEffect(() => {
    if (!user || !store.id) return undefined;

    let isActive = true;

    async function loadSavedState() {
      const { data, error } = await supabase
        .from("saved_stores")
        .select("user_id, store_id, created_at")
        .eq("user_id", user.id)
        .eq("store_id", store.id)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        setSaveMessage(`저장 상태를 확인하지 못했습니다: ${error.message}`);
        setIsCheckingSaved(false);
        return;
      }

      setIsSaved(Boolean(data));
      setSaveMessage("");
      setIsCheckingSaved(false);
    }

    loadSavedState();

    return () => {
      isActive = false;
    };
  }, [store.id, user]);

  useEffect(() => {
    if (!store.id) return undefined;

    let isActive = true;

    async function loadReviews() {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id, user_id, menu, cheese_rating, sauce_rating, cooking_rating, content, created_at, updated_at, profiles(nickname)",
        )
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });

      if (!isActive) return;

      if (error) {
        setReviewError(`리뷰를 불러오지 못했습니다: ${error.message}`);
        setIsLoadingReviews(false);
        return;
      }

      setReviews(data);
      setReviewError("");
      setIsLoadingReviews(false);

      if (data.length === 0) {
        setReviewLikes([]);
        setReviewImages([]);
        return;
      }

      const reviewIds = data.map((review) => review.id);
      const [likesResult, imagesResult] = await Promise.all([
        supabase
          .from("review_likes")
          .select("user_id, review_id, created_at")
          .in("review_id", reviewIds),
        supabase
          .from("review_images")
          .select("id, review_id, image_url, created_at, display_order")
          .in("review_id", reviewIds)
          .order("display_order", { ascending: true }),
      ]);

      if (!isActive) return;

      if (likesResult.error) {
        setLikeMessage(`좋아요 정보를 불러오지 못했습니다: ${likesResult.error.message}`);
        setReviewLikes([]);
      } else {
        setReviewLikes(likesResult.data);
        setLikeMessage("");
      }

      if (imagesResult.error) {
        setReviewError(`리뷰 사진을 불러오지 못했습니다: ${imagesResult.error.message}`);
        setReviewImages([]);
      } else {
        setReviewImages(imagesResult.data);
      }
    }

    loadReviews();

    return () => {
      isActive = false;
    };
  }, [store.id, reviewRefreshKey, reviewRefreshCounter]);

  const awardResult = useMemo(() => calculateStoreAwards(reviews), [reviews]);
  const { averages } = awardResult;
  const awards = awardResult;
  const isAwardEligible = awardResult.isEligible;
  const hasAnyAward = awards.cheese || awards.sauce || awards.cooking;
  const sortedReviews = useMemo(() => {
    const likeCounts = reviewLikes.reduce((counts, like) => {
      counts.set(like.review_id, (counts.get(like.review_id) ?? 0) + 1);
      return counts;
    }, new Map());
    const compareNewestFirst = (firstReview, secondReview) =>
      new Date(secondReview.created_at).getTime() -
      new Date(firstReview.created_at).getTime();

    return reviews.map((review) => ({
      ...review,
      review_images: reviewImages.filter(
        (image) => image.review_id === review.id,
      ),
    })).sort((firstReview, secondReview) => {
      if (reviewSort === "recommended") {
        const likeDifference =
          (likeCounts.get(secondReview.id) ?? 0) -
          (likeCounts.get(firstReview.id) ?? 0);

        if (likeDifference !== 0) return likeDifference;
      }

      return compareNewestFirst(firstReview, secondReview);
    });
  }, [reviewImages, reviewLikes, reviewSort, reviews]);

  async function toggleSavedStore() {
    if (!user) {
      setSaveMessage("지점 저장은 로그인이 필요한 회원 기능입니다.");
      return;
    }

    if (!store.id) {
      setSaveMessage("Supabase 지점 ID가 없어 저장할 수 없습니다.");
      return;
    }

    if (isCheckingSaved || isChangingSaved) return;

    setIsChangingSaved(true);
    setSaveMessage("");

    if (isSaved) {
      const { error } = await supabase
        .from("saved_stores")
        .delete()
        .eq("user_id", user.id)
        .eq("store_id", store.id);

      if (error) {
        setSaveMessage(`지점 저장을 해제하지 못했습니다: ${error.message}`);
      } else {
        setIsSaved(false);
      }
    } else {
      const { error } = await supabase.from("saved_stores").upsert(
        {
          user_id: user.id,
          store_id: store.id,
        },
        {
          onConflict: "user_id,store_id",
          ignoreDuplicates: true,
        },
      );

      if (error) {
        setSaveMessage(`지점을 저장하지 못했습니다: ${error.message}`);
      } else {
        setIsSaved(true);
      }
    }

    setIsChangingSaved(false);
  }

  async function deleteReview() {
    if (!user || !reviewToDelete || reviewToDelete.user_id !== user.id) return;

    setIsDeletingReview(true);
    setDeleteError("");

    try {
      const { imageCleanupError } = await deleteOwnReview(
        reviewToDelete,
        user.id,
      );

      if (imageCleanupError) {
        setLikeMessage(
          `리뷰는 삭제됐지만 Storage 사진 정리에 실패했습니다: ${imageCleanupError.message}`,
        );
      }
    } catch (error) {
      setDeleteError(error.message);
      setIsDeletingReview(false);
      return;
    }

    setReviewToDelete(null);
    setIsDeletingReview(false);
    setReviewRefreshCounter((currentCount) => currentCount + 1);
    onReviewsChanged?.();
  }

  async function toggleReviewLike(review) {
    if (!user) {
      setLikeMessage("리뷰 좋아요는 로그인이 필요한 회원 기능입니다.");
      return;
    }

    if (changingLikeIds.includes(review.id)) return;

    const existingLike = reviewLikes.find(
      (like) => like.review_id === review.id && like.user_id === user.id,
    );

    setChangingLikeIds((currentIds) => [...currentIds, review.id]);
    setLikeMessage("");

    if (existingLike) {
      const { error } = await supabase
        .from("review_likes")
        .delete()
        .eq("user_id", user.id)
        .eq("review_id", review.id);

      if (error) {
        setLikeMessage(`좋아요를 취소하지 못했습니다: ${error.message}`);
      } else {
        setReviewLikes((currentLikes) =>
          currentLikes.filter(
            (like) =>
              !(like.review_id === review.id && like.user_id === user.id),
          ),
        );
      }
    } else {
      const { data, error } = await supabase
        .from("review_likes")
        .upsert(
          { user_id: user.id, review_id: review.id },
          { onConflict: "user_id,review_id", ignoreDuplicates: true },
        )
        .select("user_id, review_id, created_at")
        .maybeSingle();

      if (error) {
        setLikeMessage(`좋아요를 저장하지 못했습니다: ${error.message}`);
      } else if (data) {
        setReviewLikes((currentLikes) => [...currentLikes, data]);
      } else {
        const { data: savedLike, error: lookupError } = await supabase
          .from("review_likes")
          .select("user_id, review_id, created_at")
          .eq("user_id", user.id)
          .eq("review_id", review.id)
          .maybeSingle();

        if (lookupError || !savedLike) {
          setLikeMessage("좋아요 저장 여부를 확인하지 못했습니다.");
        } else {
          setReviewLikes((currentLikes) => [...currentLikes, savedLike]);
        }
      }
    }

    setChangingLikeIds((currentIds) =>
      currentIds.filter((reviewId) => reviewId !== review.id),
    );
  }

  return (
    <article className="store-detail" aria-label={`${store.name} 상세 정보`}>
      <div className="store-detail-inner">
        <button
          type="button"
          className="store-detail-back"
          onClick={onBack}
          aria-label="이전 화면으로 돌아가기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          뒤로
        </button>

        <header className="store-detail-header">
          <div>
            <h1>{store.name}</h1>
            <p>{store.address}</p>
          </div>
          <button
            type="button"
            className={`bookmark-button ${isSaved ? "is-saved" : ""}`}
            onClick={toggleSavedStore}
            disabled={isCheckingSaved || isChangingSaved}
            aria-label={isSaved ? "저장 취소" : "지점 저장"}
            title={isSaved ? "저장 취소" : "지점 저장"}
            aria-pressed={isSaved}
            aria-busy={isCheckingSaved || isChangingSaved}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h12v18l-6-4-6 4V3Z" />
            </svg>
          </button>
        </header>

        {saveMessage && <p className="store-save-message">{saveMessage}</p>}

        <section className="store-evaluation" aria-labelledby="evaluation-title">
          <h2 id="evaluation-title">지점 평가</h2>
          <div className="evaluation-categories">
            <div>
              <span>치즈</span>
              <strong>{formatAverage(averages.cheese)}</strong>
            </div>
            <div>
              <span>소스</span>
              <strong>{formatAverage(averages.sauce)}</strong>
            </div>
            <div>
              <span>익힘</span>
              <strong>{formatAverage(averages.cooking)}</strong>
            </div>
          </div>
          {!isLoadingReviews && !reviewError && (
            <div className="store-awards" aria-label="지점 수상 결과">
              {!isAwardEligible ? (
                <p>아직 수상 판정 전이에요</p>
              ) : hasAnyAward ? (
                <div className="store-award-badges">
                  {awards.threeStar && (
                    <span className="is-three-star">엽슐랭 3스타</span>
                  )}
                  {awards.cheese && <span>치즈상</span>}
                  {awards.sauce && <span>소스상</span>}
                  {awards.cooking && <span>익힘상</span>}
                </div>
              ) : (
                <p>아직 수상 조건을 충족하지 않았어요</p>
              )}
            </div>
          )}
          {!isLoadingReviews && reviews.length === 0 && !reviewError && (
            <div className="detail-empty-state">
              <strong>아직 리뷰가 없어요</strong>
              <p>평가 데이터가 쌓이면 여기에 표시됩니다.</p>
            </div>
          )}
        </section>

        <button
          type="button"
          className="detail-review-button"
          onClick={() => onWriteReview(store)}
        >
          리뷰 작성하기
        </button>

        {message && <p className="store-detail-message">{message}</p>}

        <section className="store-reviews" aria-labelledby="reviews-title">
          <div className="reviews-heading">
            <h2 id="reviews-title">리뷰 {reviews.length}개</h2>
            <div className="review-sort" aria-label="리뷰 정렬 방식">
              <button
                type="button"
                className={reviewSort === "latest" ? "is-active" : ""}
                onClick={() => setReviewSort("latest")}
                aria-pressed={reviewSort === "latest"}
              >
                최신순
              </button>
              <span aria-hidden="true">|</span>
              <button
                type="button"
                className={reviewSort === "recommended" ? "is-active" : ""}
                onClick={() => setReviewSort("recommended")}
                aria-pressed={reviewSort === "recommended"}
              >
                추천순
              </button>
            </div>
          </div>
          {!store.id && (
            <p className="review-load-message">
              Supabase 지점 ID가 없어 리뷰를 조회할 수 없습니다.
            </p>
          )}
          {isLoadingReviews && <p className="review-load-message">리뷰를 불러오는 중...</p>}
          {reviewError && <p className="review-load-error">{reviewError}</p>}
          {likeMessage && <p className="review-like-message">{likeMessage}</p>}
          {!isLoadingReviews && !reviewError && reviews.length === 0 && (
            <div className="detail-empty-state review-empty-state">
              <strong>아직 작성된 리뷰가 없어요</strong>
            </div>
          )}
          {reviews.length > 0 && (
            <div className="review-list">
              {sortedReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isOwnReview={Boolean(user && review.user_id === user.id)}
                  isLiked={Boolean(
                    user &&
                    reviewLikes.some(
                      (like) =>
                        like.review_id === review.id && like.user_id === user.id,
                    ),
                  )}
                  likeCount={
                    reviewLikes.filter((like) => like.review_id === review.id)
                      .length
                  }
                  isChangingLike={changingLikeIds.includes(review.id)}
                  onToggleLike={toggleReviewLike}
                  onEdit={onEditReview}
                  onDelete={(selectedReview) => {
                    setDeleteError("");
                    setReviewToDelete(selectedReview);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {reviewToDelete && (
        <div className="review-delete-backdrop" role="presentation">
          <div
            className="review-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="review-delete-title"
          >
            <strong id="review-delete-title">리뷰를 삭제하시겠습니까?</strong>
            {deleteError && <p className="review-delete-error">{deleteError}</p>}
            <div>
              <button
                type="button"
                onClick={() => {
                  setReviewToDelete(null);
                  setDeleteError("");
                }}
                disabled={isDeletingReview}
              >
                취소
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={deleteReview}
                disabled={isDeletingReview}
              >
                {isDeletingReview ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default StoreDetail;
