import { useEffect, useState } from "react";
import { deleteOwnReview } from "../lib/reviews";
import { supabase } from "../lib/supabase";
import { BookmarkIcon } from "./Icons";
import "./MyPageModal.css";

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";

  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join(".");
}

function getNicknameChangeAvailability(changedAt) {
  if (!changedAt) return { canChange: true, nextDate: null };

  const nextDate = new Date(changedAt);
  if (Number.isNaN(nextDate.getTime())) {
    return { canChange: true, nextDate: null };
  }

  nextDate.setDate(nextDate.getDate() + 30);
  return { canChange: Date.now() >= nextDate.getTime(), nextDate };
}

function formatKoreanDate(date) {
  if (!date) return null;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeStore(store) {
  return {
    ...store,
    lat: Number(store.latitude),
    lng: Number(store.longitude),
    tel: store.phone,
  };
}

function ClearableField({ label, type = "text", value, onChange }) {
  return (
    <label className="mypage-profile-field">
      <span>{label}</span>
      <div>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {type !== "password" && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`${label} 지우기`}
          >
            ×
          </button>
        )}
      </div>
    </label>
  );
}

function MyReviewCard({ review, onOpenStore, onEdit, onDelete }) {
  const ratings = [
    review.cheese_rating !== null ? `치즈 ${review.cheese_rating}` : null,
    review.sauce_rating !== null ? `소스 ${review.sauce_rating}` : null,
    review.cooking_rating !== null ? `익힘 ${review.cooking_rating}` : null,
  ].filter(Boolean);

  return (
    <article className="mypage-review-card">
      <button
        type="button"
        className="mypage-review-body"
        onClick={() => onOpenStore(normalizeStore(review.stores))}
      >
        <div className="mypage-list-card-heading">
          <strong>{review.stores?.name ?? "지점 정보 없음"}</strong>
          <time dateTime={review.created_at}>{formatDate(review.created_at)}</time>
        </div>
        <p className="mypage-review-menu">{review.menu}</p>
        <p className="mypage-review-ratings">{ratings.join(" · ")}</p>
        {review.content && (
          <p className="mypage-review-content">{review.content}</p>
        )}
        {review.review_images?.length > 0 && (
          <div className={`review-card-images count-${review.review_images.length}`}>
            {review.review_images.map((image) => (
              <img key={image.id} src={image.image_url} alt="리뷰 음식 사진" />
            ))}
          </div>
        )}
      </button>
      <div className="mypage-review-actions">
        <button type="button" onClick={() => onEdit(review)}>수정</button>
        <button type="button" onClick={() => onDelete(review)}>삭제</button>
      </div>
    </article>
  );
}

function MyPageModal({
  user,
  profile,
  refreshKey,
  onClose,
  onEditReview,
  onOpenStore,
  onReviewsChanged,
  onProfileUpdated,
  onLogout,
}) {
  const [reviews, setReviews] = useState([]);
  const [savedStores, setSavedStores] = useState([]);
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState("main");
  const [reviewToDelete, setReviewToDelete] = useState(null);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [isWithdrawalConfirmOpen, setIsWithdrawalConfirmOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null);
  const nicknameAvailability = getNicknameChangeAvailability(
    profile?.nickname_changed_at,
  );

  useEffect(() => {
    let isActive = true;

    async function loadMyPage() {
      setIsLoading(true);
      const [reviewsResult, savedStoresResult] = await Promise.all([
        supabase
          .from("reviews")
          .select(
            "id, user_id, store_id, menu, cheese_rating, sauce_rating, cooking_rating, content, created_at, updated_at, stores(id, name, address, latitude, longitude, phone, sido, gugun)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("saved_stores")
          .select("user_id, store_id, created_at, stores(id, name, address, latitude, longitude, phone, sido, gugun)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (!isActive) return;

      if (reviewsResult.error || savedStoresResult.error) {
        setMessage(
          `마이페이지 정보를 불러오지 못했습니다: ${
            reviewsResult.error?.message ?? savedStoresResult.error?.message
          }`,
        );
      } else {
        let reviewImages = [];

        if (reviewsResult.data.length > 0) {
          const imagesResult = await supabase
            .from("review_images")
            .select("id, review_id, image_url, created_at, display_order")
            .in("review_id", reviewsResult.data.map((review) => review.id))
            .order("display_order", { ascending: true });

          if (!isActive) return;
          if (imagesResult.error) {
            setMessage(
              `리뷰 사진을 불러오지 못했습니다: ${imagesResult.error.message}`,
            );
          } else {
            reviewImages = imagesResult.data;
          }
        }

        setReviews(
          reviewsResult.data.map((review) => ({
            ...review,
            review_images: reviewImages.filter(
              (image) => image.review_id === review.id,
            ),
          })),
        );
        setSavedStores(savedStoresResult.data);
      }
      setIsLoading(false);
    }

    loadMyPage();

    return () => {
      isActive = false;
    };
  }, [refreshKey, user.id]);

  async function saveChanges(event) {
    event.preventDefault();
    const nextNickname = nickname.trim();
    const nextEmail = email.trim();
    const nicknameChanged = nextNickname !== (profile?.nickname ?? "");
    const emailChanged = nextEmail !== (user.email ?? "");
    const passwordChanged = password.length > 0;

    if (!nicknameChanged && !emailChanged && !passwordChanged) {
      setProfileFeedback({
        title: "변경할 정보가 없어요",
        messages: ["변경할 회원정보를 입력해주세요."],
      });
      return;
    }

    if (nicknameChanged && !nextNickname) {
      setProfileFeedback({
        title: "닉네임 변경 실패",
        messages: ["닉네임을 입력해주세요."],
      });
      return;
    }

    if (emailChanged && !nextEmail) {
      setProfileFeedback({
        title: "이메일 변경 실패",
        messages: ["변경할 이메일을 입력해주세요."],
      });
      return;
    }

    if (passwordChanged && password.length < 6) {
      setProfileFeedback({
        title: "비밀번호 변경 실패",
        messages: ["새 비밀번호는 6자 이상 입력해주세요."],
      });
      return;
    }

    setIsSaving(true);
    setMessage("");
    const successes = [];
    const failures = [];
    let emailConfirmationRequired = false;

    if (nicknameChanged && !nicknameAvailability.canChange) {
      failures.push({
        field: "nickname",
        message: `닉네임은 ${formatKoreanDate(nicknameAvailability.nextDate)}부터 다시 변경할 수 있습니다.`,
      });
    } else if (nicknameChanged) {
      const { data, error } = await supabase
        .from("profiles")
        .update({ nickname: nextNickname })
        .eq("id", user.id)
        .select("*")
        .single();

      if (error) {
        const dateInError = error.message.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        failures.push({
          field: "nickname",
          message: dateInError
            ? `닉네임은 ${dateInError.replaceAll("-", ".")}부터 다시 변경할 수 있습니다.`
            : "닉네임을 변경하지 못했습니다. 다시 시도해주세요.",
        });
      } else {
        onProfileUpdated(data);
        setNickname(data.nickname);
        successes.push({ field: "nickname", message: "닉네임은 변경되었습니다." });
      }
    }

    if (passwordChanged) {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        failures.push({
          field: "password",
          message: "비밀번호를 변경하지 못했습니다. 다시 시도해주세요.",
        });
      } else {
        setPassword("");
        successes.push({ field: "password", message: "비밀번호는 변경되었습니다." });
      }
    }

    if (emailChanged) {
      const { data, error } = await supabase.auth.updateUser({
        email: nextEmail,
      });

      if (error) {
        const isDuplicateEmail =
          error.message
            .toLowerCase()
            .includes("already been registered") ||
          error.message.toLowerCase().includes("already registered");
        failures.push({
          field: "email",
          duplicate: isDuplicateEmail,
          message: isDuplicateEmail
            ? "이미 사용 중인 이메일입니다. 다른 이메일을 입력해주세요."
            : "이메일을 변경하지 못했습니다. 다시 시도해주세요.",
        });
      } else {
        emailConfirmationRequired =
          data.user?.email?.toLocaleLowerCase() !==
          nextEmail.toLocaleLowerCase();
        successes.push({
          field: "email",
          message: emailConfirmationRequired
            ? "이메일 변경을 위해 새 이메일로 전송된 인증 메일을 확인해주세요."
            : "이메일은 변경되었습니다.",
        });
      }
    }

    let title = "변경 완료";
    let messages = ["회원정보가 변경되었습니다."];

    if (successes.length > 0 && failures.length > 0) {
      title = "일부 항목 변경 완료";
      messages = [
        ...successes.map((item) => item.message),
        ...failures.map((item) => item.message),
      ];
    } else if (failures.length > 0) {
      const onlyFailure = failures.length === 1 ? failures[0] : null;
      title = onlyFailure?.duplicate
        ? "이메일 변경 실패"
        : onlyFailure?.field === "nickname"
          ? "닉네임 변경 실패"
          : onlyFailure?.field === "password"
            ? "비밀번호 변경 실패"
            : onlyFailure?.field === "email"
              ? "이메일 변경 실패"
              : "회원정보 변경 실패";
      messages = failures.map((item) => item.message);
    } else if (emailConfirmationRequired) {
      messages = [
        "회원정보 변경 요청이 완료되었습니다.",
        "새 이메일로 전송된 인증 메일을 확인해주세요.",
      ];
    }

    setProfileFeedback({ title, messages });
    setIsSaving(false);
  }

  async function logout() {
    const didLogout = await onLogout();
    if (!didLogout) setMessage("로그아웃하지 못했습니다. 다시 시도해주세요.");
  }

  async function withdrawAccount() {
    setIsWithdrawing(true);
    setMessage("");

    const { data, error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
    });

    if (error || !data?.deleted) {
      setMessage(
        `회원탈퇴를 완료하지 못했습니다. ${error?.message ?? data?.error ?? "잠시 후 다시 시도해주세요."}`,
      );
      setIsWithdrawing(false);
      return;
    }

    if (data.storageWarning) {
      console.warn("회원탈퇴 후 리뷰 사진 정리 경고:", data.storageWarning);
    }

    setIsWithdrawalConfirmOpen(false);
    await supabase.auth.signOut({ scope: "local" });
    await onLogout();
    onClose();
  }

  async function confirmDeleteReview() {
    if (!reviewToDelete) return;

    setIsDeletingReview(true);
    setMessage("");

    try {
      const { imageCleanupError } = await deleteOwnReview(
        reviewToDelete,
        user.id,
      );
      setReviews((currentReviews) =>
        currentReviews.filter((review) => review.id !== reviewToDelete.id),
      );
      onReviewsChanged?.();
      setReviewToDelete(null);
      setMessage(
        imageCleanupError
          ? `리뷰는 삭제됐지만 사진 정리에 실패했습니다: ${imageCleanupError.message}`
          : "리뷰가 삭제되었습니다.",
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsDeletingReview(false);
    }
  }

  async function removeSavedStore(savedStore) {
    setMessage("");
    const { error } = await supabase
      .from("saved_stores")
      .delete()
      .eq("user_id", user.id)
      .eq("store_id", savedStore.store_id);

    if (error) {
      setMessage(`저장을 해제하지 못했습니다: ${error.message}`);
      return;
    }

    setSavedStores((currentStores) =>
      currentStores.filter((item) => item.store_id !== savedStore.store_id),
    );
  }

  return (
    <div className="mypage-backdrop" role="presentation">
      <section
        className="mypage-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mypage-title"
      >
        <button
          type="button"
          className="mypage-close"
          onClick={onClose}
          aria-label="마이페이지 닫기"
        >
          ×
        </button>

        {view === "main" ? (
          <h1 id="mypage-title" className="mypage-title">마이페이지</h1>
        ) : (
          <button
            type="button"
            className="mypage-back"
            onClick={() => {
              setView("main");
              setReviewToDelete(null);
              setMessage("");
            }}
          >
            ← {view === "reviews" ? "작성한 리뷰" : "저장한 지점"}
          </button>
        )}

        {isLoading && <p className="mypage-loading">정보를 불러오는 중...</p>}

        {view === "main" && (
          <>
            <section className="mypage-summary" aria-label="회원 요약">
              <p>
                {profile?.mania_passed ? "매니아 " : ""}
                <strong>{profile?.nickname ?? "회원"}</strong> 님
              </p>
              <div>
                <button type="button" onClick={() => setView("reviews")}>
                  작성한 리뷰 <strong>{isLoading ? "…" : reviews.length}</strong>
                </button>
                <button type="button" onClick={() => setView("savedStores")}>
                  저장한 지점 <strong>{isLoading ? "…" : savedStores.length}</strong>
                </button>
              </div>
            </section>

            <section className="mypage-profile-section">
          <h2>회원정보 수정</h2>
          <form className="mypage-profile-form" onSubmit={saveChanges}>
            <div>
              <ClearableField
                label="닉네임"
                value={nickname}
                onChange={setNickname}
              />
              <p className="mypage-field-help">
                {nicknameAvailability.canChange
                  ? "*30일에 한 번 변경 가능합니다."
                  : `*${formatKoreanDate(nicknameAvailability.nextDate)}부터 다시 변경할 수 있습니다.`}
              </p>
            </div>

            <ClearableField
              label="새 비밀번호"
              type="password"
              value={password}
              onChange={setPassword}
            />

            <ClearableField
              label="이메일"
              type="email"
              value={email}
              onChange={setEmail}
            />

            <button type="submit" disabled={isSaving || isLoading}>
              {isSaving ? "저장 중..." : "변경사항 저장"}
            </button>
          </form>
            </section>

            <button type="button" className="mypage-logout" onClick={logout}>
              로그아웃
            </button>

            <button
              type="button"
              className="mypage-withdrawal"
              onClick={() => setIsWithdrawalConfirmOpen(true)}
            >
              회원탈퇴
            </button>

            {isWithdrawalConfirmOpen && (
              <div
                className="mypage-withdrawal-confirm"
                role="alertdialog"
                aria-labelledby="mypage-withdrawal-title"
              >
                <strong id="mypage-withdrawal-title">
                  정말 탈퇴하시겠습니까?
                </strong>
                <p>작성한 리뷰와 저장 정보가 삭제될 수 있습니다.</p>
                <div>
                  <button
                    type="button"
                    onClick={() => setIsWithdrawalConfirmOpen(false)}
                    disabled={isWithdrawing}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={withdrawAccount}
                    disabled={isWithdrawing}
                  >
                    {isWithdrawing ? "탈퇴 처리 중..." : "회원탈퇴"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {view === "reviews" && !isLoading && (
          <section className="mypage-list-view" aria-label="작성한 리뷰 목록">
            {reviews.length === 0 ? (
              <p className="mypage-empty">아직 작성한 리뷰가 없어요.</p>
            ) : (
              <div className="mypage-card-list">
                {reviews.map((review) => (
                  <MyReviewCard
                    key={review.id}
                    review={review}
                    onOpenStore={onOpenStore}
                    onEdit={(selectedReview) =>
                      onEditReview(
                        selectedReview,
                        normalizeStore(selectedReview.stores),
                      )
                    }
                    onDelete={setReviewToDelete}
                  />
                ))}
              </div>
            )}
            {reviewToDelete && (
              <div className="mypage-inline-confirm" role="alertdialog" aria-labelledby="mypage-delete-title">
                <strong id="mypage-delete-title">리뷰를 삭제하시겠습니까?</strong>
                <div>
                  <button type="button" onClick={() => setReviewToDelete(null)} disabled={isDeletingReview}>취소</button>
                  <button type="button" className="is-danger" onClick={confirmDeleteReview} disabled={isDeletingReview}>
                    {isDeletingReview ? "삭제 중..." : "삭제"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "savedStores" && !isLoading && (
          <section className="mypage-list-view" aria-label="저장한 지점 목록">
            {savedStores.length === 0 ? (
              <p className="mypage-empty">아직 저장한 지점이 없어요.</p>
            ) : (
              <div className="mypage-card-list">
                {savedStores.map((savedStore) => (
                  <article key={savedStore.store_id} className="mypage-saved-card">
                    <button type="button" className="mypage-saved-body" onClick={() => onOpenStore(normalizeStore(savedStore.stores))}>
                      <strong>{savedStore.stores?.name ?? "지점 정보 없음"}</strong>
                      <span>{savedStore.stores?.address ?? "주소 정보 없음"}</span>
                    </button>
                    <button type="button" className="mypage-unsave" onClick={() => removeSavedStore(savedStore)} aria-label={`${savedStore.stores?.name ?? "지점"} 저장 해제`}>
                      <BookmarkIcon filled />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {profileFeedback && (
          <div className="mypage-feedback-backdrop" role="presentation">
            <section
              className="mypage-feedback-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="mypage-feedback-title"
            >
              <h2 id="mypage-feedback-title">{profileFeedback.title}</h2>
              <div>
                {profileFeedback.messages.map((feedbackMessage) => (
                  <p key={feedbackMessage}>{feedbackMessage}</p>
                ))}
              </div>
              <button type="button" onClick={() => setProfileFeedback(null)}>
                확인
              </button>
            </section>
          </div>
        )}

        {message && (
          <div className="mypage-feedback-backdrop" role="presentation">
            <section
              className="mypage-feedback-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="mypage-notice-title"
            >
              <h2 id="mypage-notice-title">안내</h2>
              <p>{message}</p>
              <button type="button" onClick={() => setMessage("")}>
                확인
              </button>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

export default MyPageModal;
