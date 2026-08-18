import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ALLOWED_REVIEW_IMAGE_TYPES,
  MAX_REVIEW_IMAGE_BYTES,
  MAX_REVIEW_IMAGES,
  removeReviewImages,
  uploadReviewImage,
} from "../lib/reviewImages";
import "./ReviewForm.css";

const REVIEW_MENUS = [
  "엽기떡볶이",
  "로제떡볶이",
  "마라떡볶이",
  "마라로제떡볶이",
  "2인 엽기떡볶이",
];

const CHEESE_MENUS = new Set([
  "엽기떡볶이",
  "로제떡볶이",
  "2인 엽기떡볶이",
]);

function normalizeStoreName(name) {
  return name.trim().replace(/^엽기떡볶이\s*/, "");
}

function normalizeAddress(address) {
  return address.trim().replace(/\s+/g, " ");
}

function isSameCoordinate(firstValue, secondValue) {
  return Math.abs(Number(firstValue) - Number(secondValue)) < 0.00001;
}

async function resolveStoreId(store) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, address, latitude, longitude")
    .limit(1000);

  if (error) {
    throw new Error(`지점 정보를 확인하지 못했습니다: ${error.message}`);
  }

  const matches = data.filter((databaseStore) => {
    const hasSameName =
      normalizeStoreName(databaseStore.name) === normalizeStoreName(store.name);
    const hasSameAddress = databaseStore.address
      ? normalizeAddress(databaseStore.address) === normalizeAddress(store.address)
      : true;
    const hasSameLatitude =
      databaseStore.latitude !== null
        ? isSameCoordinate(databaseStore.latitude, store.lat)
        : true;
    const hasSameLongitude =
      databaseStore.longitude !== null
        ? isSameCoordinate(databaseStore.longitude, store.lng)
        : true;

    return (
      hasSameName && hasSameAddress && hasSameLatitude && hasSameLongitude
    );
  });

  if (matches.length === 0) {
    throw new Error(
      "이 지점은 아직 Supabase stores 테이블과 연결되지 않아 리뷰를 저장할 수 없습니다.",
    );
  }

  if (matches.length > 1) {
    throw new Error(
      "같은 이름의 지점이 여러 개 확인되어 안전하게 저장할 수 없습니다.",
    );
  }

  return matches[0].id;
}

function RatingField({ label, value, onChange }) {
  return (
    <fieldset className="rating-field">
      <legend>{label}</legend>
      <div className="rating-options" aria-label={`${label} 점수`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            type="button"
            key={score}
            className={score <= value ? "is-selected" : ""}
            onClick={() => onChange(score)}
            aria-label={`${label} ${score}점`}
            aria-pressed={score === value}
          >
            ★
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewForm({
  store,
  review = null,
  onCancel,
  onChangeStore,
  onSuccess,
}) {
  const isEditing = Boolean(review);
  const [menu, setMenu] = useState(review?.menu ?? "");
  const [cheeseRating, setCheeseRating] = useState(review?.cheese_rating ?? 0);
  const [sauceRating, setSauceRating] = useState(review?.sauce_rating ?? 0);
  const [cookingRating, setCookingRating] = useState(review?.cooking_rating ?? 0);
  const [content, setContent] = useState(review?.content ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [existingImages, setExistingImages] = useState(
    review?.review_images ?? [],
  );
  const [removedImages, setRemovedImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const fileInputRef = useRef(null);
  const newImagesRef = useRef([]);

  useEffect(() => {
    newImagesRef.current = newImages;
  }, [newImages]);

  useEffect(() => () => {
    newImagesRef.current.forEach((image) =>
      URL.revokeObjectURL(image.previewUrl),
    );
  }, []);

  const needsCheeseRating = CHEESE_MENUS.has(menu);
  const canSubmit =
    menu &&
    sauceRating > 0 &&
    cookingRating > 0 &&
    (!needsCheeseRating || cheeseRating > 0) &&
    !isSubmitting;

  function changeMenu(nextMenu) {
    setMenu(nextMenu);

    if (!CHEESE_MENUS.has(nextMenu)) {
      setCheeseRating(0);
    }
  }

  function selectImages(event) {
    const files = Array.from(event.target.files ?? []);
    const availableCount =
      MAX_REVIEW_IMAGES - existingImages.length - newImages.length;
    const acceptedFiles = [];
    let validationMessage = "";

    for (const file of files) {
      if (acceptedFiles.length >= availableCount) {
        validationMessage = `사진은 최대 ${MAX_REVIEW_IMAGES}장까지 첨부할 수 있습니다.`;
        break;
      }

      if (!ALLOWED_REVIEW_IMAGE_TYPES.includes(file.type)) {
        validationMessage = "JPG, PNG, WebP 이미지 파일만 첨부할 수 있습니다.";
        continue;
      }

      if (file.size > MAX_REVIEW_IMAGE_BYTES) {
        validationMessage = "사진 한 장의 크기는 5MB 이하여야 합니다.";
        continue;
      }

      acceptedFiles.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setNewImages((currentImages) => [...currentImages, ...acceptedFiles]);
    setErrorMessage(validationMessage);
    event.target.value = "";
  }

  function removeNewImage(imageId) {
    setNewImages((currentImages) => {
      const image = currentImages.find((item) => item.id === imageId);
      if (image) URL.revokeObjectURL(image.previewUrl);
      return currentImages.filter((item) => item.id !== imageId);
    });
  }

  function removeExistingImage(image) {
    setExistingImages((currentImages) =>
      currentImages.filter((item) => item.id !== image.id),
    );
    setRemovedImages((currentImages) => [...currentImages, image]);
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("로그인 상태를 확인할 수 없습니다. 다시 로그인해주세요.");
      }

      const reviewValues = {
        menu,
        cheese_rating: needsCheeseRating ? cheeseRating : null,
        sauce_rating: sauceRating,
        cooking_rating: cookingRating,
        content: content.trim(),
      };

      let savedReviewId;

      if (isEditing) {
        const { data, error: updateError } = await supabase
          .from("reviews")
          .update(reviewValues)
          .eq("id", review.id)
          .eq("user_id", user.id)
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw new Error(`리뷰 수정에 실패했습니다: ${updateError.message}`);
        }

        if (!data) {
          throw new Error("수정할 수 있는 본인 리뷰를 찾지 못했습니다.");
        }
        savedReviewId = review.id;
      } else {
        const storeId = store.id ?? (await resolveStoreId(store));
        const { data, error: insertError } = await supabase
          .from("reviews")
          .insert({
            user_id: user.id,
            store_id: storeId,
            ...reviewValues,
          })
          .select("id")
          .single();

        if (insertError) {
          throw new Error(`리뷰 저장에 실패했습니다: ${insertError.message}`);
        }
        savedReviewId = data.id;
      }

      const imageErrors = [];

      if (isEditing && removedImages.length > 0) {
        try {
          const { error: deleteImageRowsError } = await supabase
            .from("review_images")
            .delete()
            .in("id", removedImages.map((image) => image.id));

          if (deleteImageRowsError) throw deleteImageRowsError;
          await removeReviewImages(removedImages);
        } catch (error) {
          imageErrors.push(`기존 사진 삭제 실패: ${error.message}`);
        }
      }

      const usedDisplayOrders = new Set(
        existingImages
          .map((image) => Number(image.display_order))
          .filter((order) => order >= 1 && order <= MAX_REVIEW_IMAGES),
      );
      const availableDisplayOrders = Array.from(
        { length: MAX_REVIEW_IMAGES },
        (_, index) => index + 1,
      ).filter((order) => !usedDisplayOrders.has(order));

      for (const [index, image] of newImages.entries()) {
        try {
          await uploadReviewImage({
            file: image.file,
            userId: user.id,
            reviewId: savedReviewId,
            order: availableDisplayOrders[index],
          });
        } catch (error) {
          imageErrors.push(`${image.file.name}: ${error.message}`);
        }
      }

      const successMessage = isEditing
        ? "리뷰가 수정되었습니다."
        : "리뷰가 등록되었습니다.";
      onSuccess(
        imageErrors.length > 0
          ? `${successMessage} 사진 처리 오류: ${imageErrors.join(" / ")}`
          : successMessage,
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article
      className="review-form-screen"
      aria-label={`${store.name} 리뷰 ${isEditing ? "수정" : "작성"}`}
    >
      <div className="review-form-inner">
        <button
          type="button"
          className="review-form-back"
          onClick={onCancel}
          aria-label="리뷰 작성을 취소하고 지점 상세로 돌아가기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {isEditing ? "수정 취소" : "작성 취소"}
        </button>

        <header className="review-form-header">
          <p>{isEditing ? "리뷰 수정" : "리뷰 작성"}</p>
          <div className="review-store-heading">
            <div>
              <span>방문한 지점</span>
              <h1>{store.name}</h1>
            </div>
            {onChangeStore && (
              <button type="button" onClick={onChangeStore}>
                변경
              </button>
            )}
          </div>
          <p className="review-store-address">{store.address}</p>
        </header>

        <form onSubmit={submitReview}>
          <label className="review-menu-field">
            <span>메뉴</span>
            <select value={menu} onChange={(event) => changeMenu(event.target.value)}>
              <option value="">메뉴를 선택해주세요</option>
              {REVIEW_MENUS.map((menuName) => (
                <option key={menuName} value={menuName}>
                  {menuName}
                </option>
              ))}
            </select>
          </label>

          <div className="review-ratings">
            {needsCheeseRating && (
              <RatingField
                label="치즈"
                value={cheeseRating}
                onChange={setCheeseRating}
              />
            )}
            <RatingField
              label="소스"
              value={sauceRating}
              onChange={setSauceRating}
            />
            <RatingField
              label="익힘"
              value={cookingRating}
              onChange={setCookingRating}
            />
          </div>

          <label className="review-content-field">
            <span>한줄평 / 리뷰</span>
            <div>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="이 지점의 맛과 경험을 알려주세요"
                rows="5"
              />
              {content && (
                <button
                  type="button"
                  onClick={() => setContent("")}
                  aria-label="리뷰 내용 전체 지우기"
                >
                  ×
                </button>
              )}
            </div>
          </label>

          <section className="review-image-field" aria-labelledby="review-images-title">
            <div className="review-image-heading">
              <strong id="review-images-title">음식 사진</strong>
              <span>
                {existingImages.length + newImages.length} / {MAX_REVIEW_IMAGES}
              </span>
            </div>
            {(existingImages.length > 0 || newImages.length > 0) && (
              <div className="review-image-previews">
                {existingImages.map((image) => (
                  <div key={image.id} className="review-image-preview">
                    <img src={image.image_url} alt="현재 리뷰 사진" />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(image)}
                      aria-label="현재 리뷰 사진 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {newImages.map((image) => (
                  <div key={image.id} className="review-image-preview">
                    <img src={image.previewUrl} alt="새 리뷰 사진 미리보기" />
                    <button
                      type="button"
                      onClick={() => removeNewImage(image.id)}
                      aria-label="선택한 리뷰 사진 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={selectImages}
              hidden
            />
            <button
              type="button"
              className="review-image-add-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                existingImages.length + newImages.length >= MAX_REVIEW_IMAGES
              }
            >
              사진 선택
            </button>
            <p>선택사항 · JPG/PNG/WebP · 최대 3장 · 장당 5MB 이하</p>
          </section>

          {errorMessage && <p className="review-form-error">{errorMessage}</p>}

          <button
            type="submit"
            className="review-submit-button"
            disabled={!canSubmit}
          >
            {isSubmitting
              ? isEditing
                ? "수정 중..."
                : "등록 중..."
              : isEditing
                ? "수정 완료"
                : "리뷰 등록"}
          </button>
        </form>
      </div>
    </article>
  );
}

export default ReviewForm;
