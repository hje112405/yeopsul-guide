import { useMemo, useState } from "react";
import { calculateDistanceKm, formatDistance } from "../lib/location";
import "./StoreSelector.css";

function StoreAwards({ awards }) {
  if (!awards?.isEligible) return null;

  const badges = [
    awards.threeStar && { label: "엽슐랭 3스타", isThreeStar: true },
    awards.cheese && { label: "치즈상" },
    awards.sauce && { label: "소스상" },
    awards.cooking && { label: "익힘상" },
  ].filter(Boolean);

  if (badges.length === 0) return null;

  return (
    <div className="store-selector-awards" aria-label="지점 수상 정보">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={badge.isThreeStar ? "is-three-star" : ""}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export default function StoreSelector({
  stores,
  userPosition,
  onBack,
  onSelect,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase("ko-KR");
  const visibleStores = useMemo(() => {
    const matchedStores = normalizedSearchTerm
      ? stores.filter((store) =>
          [store.name, store.address, store.sido, store.gugun].some((value) =>
            value?.toLocaleLowerCase("ko-KR").includes(normalizedSearchTerm),
          ),
        )
      : stores;

    if (!userPosition) return matchedStores;

    return matchedStores
      .map((store) => ({
        ...store,
        distanceKm: calculateDistanceKm(userPosition, store),
      }))
      .sort((firstStore, secondStore) =>
        firstStore.distanceKm - secondStore.distanceKm,
      );
  }, [normalizedSearchTerm, stores, userPosition]);

  return (
    <section className="store-selector-screen" aria-label="리뷰 지점 선택">
      <div className="store-selector-inner">
        <header className="store-selector-header">
          <button type="button" className="store-selector-back" onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            뒤로가기
          </button>
          <h1>지점 선택</h1>
        </header>

        <label className="store-selector-search">
          <span className="sr-only">지점명 또는 지역 검색</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="지점명 또는 지역 검색"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="검색어 전체 삭제"
            >
              ×
            </button>
          )}
        </label>

        <div className="store-selector-list">
          {visibleStores.map((store) => (
            <button
              type="button"
              className="store-selector-card"
              key={store.id ?? `${store.name}-${store.address}`}
              onClick={() => onSelect(store)}
            >
              <div className="store-selector-card-heading">
                <strong>{store.name}</strong>
                {formatDistance(store.distanceKm) && (
                  <span>{formatDistance(store.distanceKm)}</span>
                )}
              </div>
              <p>{store.address}</p>
              <StoreAwards awards={store.awards} />
            </button>
          ))}
          {visibleStores.length === 0 && (
            <p className="store-selector-empty">검색 결과가 없어요.</p>
          )}
        </div>
      </div>
    </section>
  );
}
