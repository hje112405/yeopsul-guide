import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import StoreDetail from "./components/StoreDetail";
import ReviewForm from "./components/ReviewForm";
import StoreSelector from "./components/StoreSelector";
import MyPageModal from "./components/MyPageModal";
import ManiaTest from "./components/ManiaTest";
import SignupModal from "./components/SignupModal";
import LoginModal from "./components/LoginModal";
import MemberAccessModal from "./components/MemberAccessModal";
import { StarIcon } from "./components/Icons";
import { calculateStoreAwards } from "./lib/awards";
import { calculateDistanceKm, formatDistance } from "./lib/location";
import "./Explorer.css";
import {
  AdvancedMarker,
  APIProvider,
  ControlPosition,
  Map,
  MapControl,
  Marker,
  useMap,
} from "@vis.gl/react-google-maps";

const CAPITAL_REGIONS = ["서울특별시", "경기도", "인천광역시"];
const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const CARD_MIN_ZOOM = 13;
const CARD_COLLISION_WIDTH = 184;
const CARD_COLLISION_HEIGHT = 96;
const CARD_COLLISION_GAP = 12;
const DEFAULT_FALLBACK_ZOOM = 9;
const EMPTY_AWARD_RESULT = calculateStoreAwards([]);
const INDIVIDUAL_AWARD_FILTER_KEYS = ["cheese", "sauce", "cooking"];
const AWARD_FILTERS = [
  { key: "threeStar", label: "3스타" },
  { key: "cheese", label: "치즈상" },
  { key: "sauce", label: "소스상" },
  { key: "cooking", label: "익힘상" },
];
const CURRENT_LOCATION_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="13" fill="#2563eb" fill-opacity="0.25"/>
    <circle cx="16" cy="16" r="8" fill="#2563eb" stroke="white" stroke-width="3"/>
  </svg>
`)}`;

function getShortLocation(store) {
  const addressParts =
    store.address.match(/[가-힣0-9]+(?:구|동|읍|면)(?=[,\s)])/g) ?? [];
  const uniqueParts = [...new Set([store.gugun, ...addressParts])].filter(
    Boolean,
  );

  return uniqueParts.slice(-2).join(" · ") || store.sido;
}

function getStoreKey(store) {
  return String(store.id ?? `${store.name}|${store.address}`);
}

function getDefaultUserZoom() {
  return typeof window !== "undefined" && window.innerWidth < 640 ? 14 : 13;
}

function isStoreInsideBounds(store, bounds) {
  if (!bounds) return false;
  const isInsideLatitude =
    store.lat >= bounds.south && store.lat <= bounds.north;
  const isInsideLongitude =
    bounds.west <= bounds.east
      ? store.lng >= bounds.west && store.lng <= bounds.east
      : store.lng >= bounds.west || store.lng <= bounds.east;
  return isInsideLatitude && isInsideLongitude;
}

function doRectsOverlap(firstRect, secondRect) {
  const gap = CARD_COLLISION_GAP;
  return !(
    firstRect.right + gap <= secondRect.left ||
    firstRect.left >= secondRect.right + gap ||
    firstRect.bottom + gap <= secondRect.top ||
    firstRect.top >= secondRect.bottom + gap
  );
}

function CurrentLocationControl({
  userPosition,
  isSheetOpen,
  onReturnToUser,
}) {
  const map = useMap();

  function moveToCurrentLocation() {
    if (!map || !userPosition) return;

    onReturnToUser();
    map.panTo(userPosition);
    map.setZoom(getDefaultUserZoom());
  }

  return (
    <MapControl position={ControlPosition.RIGHT_BOTTOM}>
      <button
        type="button"
        onClick={moveToCurrentLocation}
        disabled={!userPosition}
        title={userPosition ? "현재 위치로 이동" : "현재 위치를 사용할 수 없습니다"}
        aria-label={
          userPosition ? "현재 위치로 이동" : "현재 위치를 사용할 수 없습니다"
        }
        style={{
          margin: `0 10px ${isSheetOpen ? 292 : 88}px 0`,
          padding: "10px 14px",
          border: "1px solid #d1d5db",
          borderRadius: "999px",
          background: userPosition ? "#fff" : "#e5e7eb",
          color: userPosition ? "#1f2937" : "#9ca3af",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          cursor: userPosition ? "pointer" : "not-allowed",
          fontWeight: 700,
        }}
      >
        ◎ 내 위치
      </button>
    </MapControl>
  );
}

function MapViewportController({ focusRequest }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusRequest) return;

    map.panTo({ lat: focusRequest.lat, lng: focusRequest.lng });
    map.setZoom(getDefaultUserZoom());
  }, [focusRequest, map]);

  return null;
}

function AwardMarkerCard({ store, onSelect }) {
  const awardItems = [
    { key: "cheese", label: "치즈상" },
    { key: "sauce", label: "소스상" },
    { key: "cooking", label: "익힘상" },
  ];

  return (
    <button
      type="button"
      className="award-marker"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(store);
      }}
      aria-label={`${store.name} 지점 선택`}
    >
      <div className="award-marker-surface">
        <div className="award-marker-awards" aria-label={`${store.name} 수상 정보`}>
          {awardItems.map((award) => {
            const isAwarded = Boolean(
              store.awards?.isEligible && store.awards?.[award.key],
            );

            return (
              <span
                key={award.key}
                className={isAwarded ? "is-awarded" : ""}
              >
                <StarIcon filled={isAwarded} />
                {award.label}
              </span>
            );
          })}
        </div>
        <div className="award-marker-card">
          <strong>{store.name}</strong>
          <span>{store.address}</span>
        </div>
      </div>
      <span className="award-marker-pointer" aria-hidden="true" />
    </button>
  );
}

function YeopsulMap({
  onProfileClick,
  user,
  profile,
  onProfileUpdated,
  onLogout,
}) {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [detailStore, setDetailStore] = useState(null);
  const [reviewStore, setReviewStore] = useState(null);
  const [editingReview, setEditingReview] = useState(null);
  const [reviewEntrySource, setReviewEntrySource] = useState(null);
  const [isStoreSelectorOpen, setIsStoreSelectorOpen] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [focusRequest, setFocusRequest] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState("map");
  const [userPosition, setUserPosition] = useState(null);
  const [isLocationReady, setIsLocationReady] = useState(
    () => typeof navigator === "undefined" || !navigator.geolocation,
  );
  const [mapViewport, setMapViewport] = useState(null);
  const [cardPriorityMode, setCardPriorityMode] = useState("user");
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [storeAwardsById, setStoreAwardsById] = useState({});
  const [activeAwardFilters, setActiveAwardFilters] = useState([]);

  useEffect(() => {
    async function loadStores() {
      try {
        const { data: databaseStores, error: databaseError } = await supabase
          .from("stores")
          .select(
            "id, sido, gugun, name, address, latitude, longitude, phone",
          )
          .in("sido", CAPITAL_REGIONS)
          .limit(1000);

        if (!databaseError) {
          const validDatabaseStores = databaseStores
            .filter((store) => {
              const latitude = Number(store.latitude);
              const longitude = Number(store.longitude);

              return (
                CAPITAL_REGIONS.includes(store.sido) &&
                store.name?.trim() &&
                store.address?.trim() &&
                Number.isFinite(latitude) &&
                Number.isFinite(longitude) &&
                latitude >= -90 &&
                latitude <= 90 &&
                longitude >= -180 &&
                longitude <= 180
              );
            })
            .map((store) => ({
              ...store,
              lat: Number(store.latitude),
              lng: Number(store.longitude),
              tel: store.phone,
              shortLocation: getShortLocation(store),
            }));

          if (validDatabaseStores.length === 412) {
            setStores(validDatabaseStores);
            return;
          }
        }

        const response = await fetch("/yupdduk-all-stores.json");

        if (!response.ok) {
          throw new Error("지점 JSON 파일을 불러오지 못했습니다.");
        }

        const data = await response.json();
        const capitalStores = data.stores
          .filter((store) => CAPITAL_REGIONS.includes(store.sido))
          .filter((store) => {
            const lat = Number(store.lat);
            const lng = Number(store.lng);

            return (
              store.lat !== "" &&
              store.lng !== "" &&
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              lat >= -90 &&
              lat <= 90 &&
              lng >= -180 &&
              lng <= 180
            );
          })
          .map((store) => ({
            ...store,
            lat: Number(store.lat),
            lng: Number(store.lng),
            shortLocation: getShortLocation(store),
          }));

        setStores(capitalStores);
      } catch (error) {
        console.error("지점 데이터 로딩 실패:", error);
      }
    }

    loadStores();
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadStoreAwards() {
      const allReviews = [];
      const pageSize = 1000;
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from("reviews")
          .select("store_id, cheese_rating, sauce_rating, cooking_rating")
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (!isActive) return;
        if (error) {
          console.error("지도 수상 정보를 불러오지 못했습니다:", error);
          return;
        }

        allReviews.push(...data);
        if (data.length < pageSize) break;
        offset += pageSize;
      }

      const reviewsByStore = {};
      allReviews.forEach((review) => {
        if (!reviewsByStore[review.store_id]) reviewsByStore[review.store_id] = [];
        reviewsByStore[review.store_id].push(review);
      });

      const nextAwardsById = {};
      Object.entries(reviewsByStore).forEach(([storeId, storeReviews]) => {
        nextAwardsById[storeId] = calculateStoreAwards(storeReviews);
      });

      if (isActive) setStoreAwardsById(nextAwardsById);
    }

    loadStoreAwards();

    return () => {
      isActive = false;
    };
  }, [reviewRefreshKey, user?.id]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return undefined;
    }

    let isActive = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isActive) return;

        setUserPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocationReady(true);
      },
      (error) => {
        if (!isActive) return;

        console.warn("현재 위치를 가져오지 못해 서울을 표시합니다.", error);
        setIsLocationReady(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );

    return () => {
      isActive = false;
    };
  }, []);

  const initialCenter = userPosition ?? SEOUL_CENTER;
  const storesWithAwards = useMemo(
    () =>
      stores.map((store) => ({
        ...store,
        awards: storeAwardsById[store.id] ?? EMPTY_AWARD_RESULT,
      })),
    [storeAwardsById, stores],
  );
  const filteredStores = useMemo(
    () =>
      storesWithAwards.filter((store) =>
        activeAwardFilters.every((filterKey) => store.awards[filterKey]),
      ),
    [activeAwardFilters, storesWithAwards],
  );
  const isThreeStarFilterActive = INDIVIDUAL_AWARD_FILTER_KEYS.every(
    (filterKey) => activeAwardFilters.includes(filterKey),
  );
  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase("ko-KR");
  const visibleStores = useMemo(
    () =>
      normalizedSearchTerm
        ? filteredStores.filter((store) =>
            [store.name, store.address, store.sido, store.gugun].some((value) =>
              value?.toLocaleLowerCase("ko-KR").includes(normalizedSearchTerm),
            ),
          )
        : filteredStores,
    [filteredStores, normalizedSearchTerm],
  );
  const storesByDistance = useMemo(() => {
    if (!userPosition) return visibleStores;

    return visibleStores
      .map((store) => ({
        ...store,
        distanceKm: calculateDistanceKm(userPosition, store),
      }))
      .sort((firstStore, secondStore) =>
        firstStore.distanceKm - secondStore.distanceKm,
      );
  }, [userPosition, visibleStores]);
  const searchResults = normalizedSearchTerm ? storesByDistance : [];
  const selectedStoreWithAwards = selectedStore
    ? storesWithAwards.find(
        (store) => getStoreKey(store) === getStoreKey(selectedStore),
      ) ??
      selectedStore
    : null;
  const cardMarkerStoreKeys = useMemo(() => {
    if (
      !mapViewport ||
      mapViewport.zoom < CARD_MIN_ZOOM ||
      !mapViewport.projection
    ) {
      return new Set();
    }

    const storesInViewport = visibleStores.filter((store) =>
      isStoreInsideBounds(store, mapViewport.bounds),
    );
    const priorityPosition =
      cardPriorityMode === "user" && userPosition
        ? userPosition
        : mapViewport.center;
    const orderedStores = [...storesInViewport].sort(
      (firstStore, secondStore) =>
        calculateDistanceKm(priorityPosition, firstStore) -
        calculateDistanceKm(priorityPosition, secondStore),
    );
    const selectedKey = selectedStore ? getStoreKey(selectedStore) : null;
    const selectedIsVisible = selectedKey
      ? orderedStores.some((store) => getStoreKey(store) === selectedKey)
      : false;
    const candidates = selectedIsVisible
      ? [
          selectedStore,
          ...orderedStores.filter(
            (store) => getStoreKey(store) !== selectedKey,
          ),
        ]
      : orderedStores;
    const centerPoint = mapViewport.projection.fromLatLngToPoint(
      mapViewport.center,
    );
    if (!centerPoint) return new Set();

    const scale = 2 ** mapViewport.zoom;
    const acceptedRects = [];
    const acceptedStoreKeys = new Set();

    candidates.forEach((store) => {
      const worldPoint = mapViewport.projection.fromLatLngToPoint({
        lat: store.lat,
        lng: store.lng,
      });
      if (!worldPoint) return;

      const anchorX =
        (worldPoint.x - centerPoint.x) * scale + mapViewport.width / 2;
      const anchorY =
        (worldPoint.y - centerPoint.y) * scale + mapViewport.height / 2;
      const candidateRect = {
        left: anchorX - CARD_COLLISION_WIDTH / 2,
        right: anchorX + CARD_COLLISION_WIDTH / 2,
        top: anchorY - CARD_COLLISION_HEIGHT,
        bottom: anchorY,
      };

      if (
        acceptedRects.some((acceptedRect) =>
          doRectsOverlap(candidateRect, acceptedRect),
        )
      ) {
        return;
      }

      acceptedRects.push(candidateRect);
      acceptedStoreKeys.add(getStoreKey(store));
    });

    return acceptedStoreKeys;
  }, [
    cardPriorityMode,
    mapViewport,
    selectedStore,
    userPosition,
    visibleStores,
  ]);
  const selectedStoreDistance =
    selectedStoreWithAwards && userPosition
      ? calculateDistanceKm(userPosition, selectedStoreWithAwards)
      : null;
  const isBottomSheetOpen = Boolean(selectedStore);

  function captureMapViewport(event) {
    const map = event.map;
    const bounds = map.getBounds()?.toJSON();
    const center = map.getCenter()?.toJSON();
    const projection = map.getProjection();
    const mapElement = map.getDiv();
    const zoom = map.getZoom();

    if (!bounds || !center || !projection || !Number.isFinite(zoom)) return;

    setMapViewport({
      bounds,
      center,
      projection,
      zoom,
      width: mapElement.clientWidth,
      height: mapElement.clientHeight,
    });
  }

  function selectSearchResult(store) {
    setCardPriorityMode("map");
    setSelectedStore(store);
    setFocusRequest({ ...store });
    setSearchTerm("");
    setViewMode("map");
  }

  function selectListStore(store) {
    toggleMarkerSelection(store);
  }

  function toggleMarkerSelection(store) {
    setSelectedStore((currentStore) => {
      const isSameStore =
        currentStore && getStoreKey(currentStore) === getStoreKey(store);

      return isSameStore ? null : store;
    });
  }

  function showStoreDetails() {
    if (!selectedStoreWithAwards) return;

    setReviewMessage("");
    setDetailStore(selectedStoreWithAwards);
  }

  function prepareReview(store) {
    if (!store) {
      console.log("리뷰를 작성할 지점을 먼저 선택해주세요.");
      return;
    }

    if (!user) {
      onProfileClick();
      return;
    }

    setReviewMessage("");
    setEditingReview(null);
    setReviewEntrySource("detail");
    setIsStoreSelectorOpen(false);
    setReviewStore(store);
  }

  function startFabReview() {
    if (!user) {
      onProfileClick();
      return;
    }

    setReviewMessage("");
    setEditingReview(null);
    setReviewStore(null);
    setReviewEntrySource("fab");
    setIsStoreSelectorOpen(true);
  }

  function selectReviewStore(store) {
    setReviewStore(store);
    setIsStoreSelectorOpen(false);
  }

  function cancelReviewForm() {
    setReviewStore(null);
    setEditingReview(null);

    if (reviewEntrySource === "fab") {
      setIsStoreSelectorOpen(true);
      return;
    }

    setReviewEntrySource(null);
  }

  function changeReviewStore() {
    if (reviewEntrySource !== "fab") return;
    setReviewStore(null);
    setEditingReview(null);
    setIsStoreSelectorOpen(true);
  }

  function editReview(review, reviewStoreOverride = detailStore) {
    if (!user || review.user_id !== user.id || !reviewStoreOverride) return;

    setReviewMessage("");
    setEditingReview(review);
    setReviewEntrySource(isMyPageOpen ? "mypage" : "detail");
    setIsStoreSelectorOpen(false);
    setReviewStore(reviewStoreOverride);
  }

  function completeReview(message) {
    setReviewStore(null);
    setEditingReview(null);
    setReviewEntrySource(null);
    setIsStoreSelectorOpen(false);
    setReviewMessage(message);
    setReviewRefreshKey((currentKey) => currentKey + 1);
  }

  function toggleAwardFilter(filterKey) {
    setSelectedStore(null);
    setActiveAwardFilters((currentFilters) => {
      if (filterKey === "threeStar") {
        const areAllIndividualAwardsSelected =
          INDIVIDUAL_AWARD_FILTER_KEYS.every((key) =>
            currentFilters.includes(key),
          );

        return areAllIndividualAwardsSelected
          ? []
          : [...INDIVIDUAL_AWARD_FILTER_KEYS];
      }

      return currentFilters.includes(filterKey)
        ? currentFilters.filter((key) => key !== filterKey)
        : [...currentFilters, filterKey];
    });
  }

  return (
    <section className="explorer" aria-label="엽떡 지점 탐색">
      <header className="explorer-header">
        <div className="explorer-title-row">
          <h1 className="explorer-title">엽슐랭가이드</h1>
          <button
            type="button"
            className="profile-button"
            onClick={() =>
              user ? setIsMyPageOpen(true) : onProfileClick()
            }
            aria-label="마이페이지로 이동"
            title="마이페이지"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </button>
        </div>

        <div className="store-search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="text"
            inputMode="search"
            value={searchTerm}
            onChange={(event) => {
              setSelectedStore(null);
              setSearchTerm(event.target.value);
            }}
            placeholder="지점명 또는 지역 검색"
            aria-label="지점명 또는 지역 검색"
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-button"
              onClick={() => setSearchTerm("")}
              aria-label="검색어 지우기"
            >
              ×
            </button>
          )}

          {normalizedSearchTerm && (
            <div className="search-results" role="listbox">
              {searchResults.length > 0 ? (
                searchResults.map((store) => (
                  <button
                    type="button"
                    key={getStoreKey(store)}
                    className="search-result-item"
                    onClick={() => selectSearchResult(store)}
                    role="option"
                    aria-selected="false"
                  >
                    <strong>{store.name}</strong>
                    <span>{store.address}</span>
                    {formatDistance(store.distanceKm) && (
                      <span className="store-distance">
                        내 위치에서 {formatDistance(store.distanceKm)}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <p className="empty-search-result">검색 결과가 없습니다.</p>
              )}
            </div>
          )}
        </div>
        <div className="award-filters" aria-label="지점 수상 필터">
          <button
            type="button"
            className={activeAwardFilters.length === 0 ? "is-active" : ""}
            onClick={() => {
              setSelectedStore(null);
              setActiveAwardFilters([]);
            }}
          >
            전체
          </button>
          {AWARD_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.key}
              className={
                (filter.key === "threeStar"
                  ? isThreeStarFilterActive
                  : activeAwardFilters.includes(filter.key))
                  ? "is-active"
                  : ""
              }
              onClick={() => toggleAwardFilter(filter.key)}
              aria-pressed={
                filter.key === "threeStar"
                  ? isThreeStarFilterActive
                  : activeAwardFilters.includes(filter.key)
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <div className="explorer-content">
        <div
          className={`map-pane ${viewMode !== "map" ? "is-hidden" : ""}`}
          aria-hidden={viewMode !== "map"}
        >
          <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
            {isLocationReady && (
              <Map
                defaultCenter={initialCenter}
                defaultZoom={
                  userPosition ? getDefaultUserZoom() : DEFAULT_FALLBACK_ZOOM
                }
                mapId="DEMO_MAP_ID"
                mapTypeControl={false}
                onDragstart={() => setCardPriorityMode("map")}
                onIdle={captureMapViewport}
                style={{ width: "100%", height: "100%" }}
              >
            {visibleStores.map((store) =>
              cardMarkerStoreKeys.has(getStoreKey(store)) ? (
                <AdvancedMarker
                  key={getStoreKey(store)}
                  position={{ lat: store.lat, lng: store.lng }}
                  title={store.name}
                  clickable
                >
                  <AwardMarkerCard
                    store={store}
                    onSelect={toggleMarkerSelection}
                  />
                </AdvancedMarker>
              ) : (
                <Marker
                  key={getStoreKey(store)}
                  position={{ lat: store.lat, lng: store.lng }}
                  title={store.name}
                  onClick={() => toggleMarkerSelection(store)}
                />
              ),
            )}

            {userPosition && (
              <Marker
                position={userPosition}
                title="현재 위치"
                icon={CURRENT_LOCATION_ICON}
                zIndex={1000}
              />
            )}

            <CurrentLocationControl
              userPosition={userPosition}
              isSheetOpen={isBottomSheetOpen}
              onReturnToUser={() => setCardPriorityMode("user")}
            />
            <MapViewportController focusRequest={focusRequest} />
              </Map>
            )}
          </APIProvider>
        </div>

        <div
          className={`list-pane ${viewMode !== "list" ? "is-hidden" : ""}`}
          aria-hidden={viewMode !== "list"}
        >
          <div className="store-list">
            {storesByDistance.map((store) => (
              <button
                type="button"
                key={getStoreKey(store)}
                className="store-list-card"
                onClick={() => selectListStore(store)}
              >
                <strong>{store.name}</strong>
                <span>{store.address}</span>
                {formatDistance(store.distanceKm) && (
                  <span className="store-distance">
                    내 위치에서 {formatDistance(store.distanceKm)}
                  </span>
                )}
                {store.awards?.isEligible &&
                  (store.awards.cheese ||
                    store.awards.sauce ||
                    store.awards.cooking) && (
                    <div
                      className="bottom-sheet-awards"
                      aria-label="지점 수상 정보"
                    >
                      {store.awards.threeStar && (
                        <span className="is-three-star">엽슐랭 3스타</span>
                      )}
                      {store.awards.cheese && <span>치즈상</span>}
                      {store.awards.sauce && <span>소스상</span>}
                      {store.awards.cooking && <span>익힘상</span>}
                    </div>
                  )}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={`review-fab ${isBottomSheetOpen ? "is-sheet-open" : ""}`}
          onClick={startFabReview}
          aria-label="리뷰 작성"
          title="리뷰 작성"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
        </button>

        <aside
          className={`store-bottom-sheet ${isBottomSheetOpen ? "is-open" : ""}`}
          aria-hidden={!isBottomSheetOpen}
          aria-label="선택한 지점 정보"
        >
          {selectedStoreWithAwards && (
            <div className="bottom-sheet-content">
              <div className="bottom-sheet-heading">
                <div>
                  <strong>{selectedStoreWithAwards.name}</strong>
                  <p>{selectedStoreWithAwards.address}</p>
                </div>
                <button
                  type="button"
                  className="bottom-sheet-close"
                  onClick={() => setSelectedStore(null)}
                  aria-label="지점 정보 닫기"
                >
                  ×
                </button>
              </div>

              {formatDistance(selectedStoreDistance) && (
                <p className="bottom-sheet-distance">
                  내 위치에서 {formatDistance(selectedStoreDistance)}
                </p>
              )}

              {selectedStoreWithAwards.awards?.isEligible &&
                (selectedStoreWithAwards.awards.cheese ||
                  selectedStoreWithAwards.awards.sauce ||
                  selectedStoreWithAwards.awards.cooking) && (
                  <div className="bottom-sheet-awards" aria-label="지점 수상 정보">
                    {selectedStoreWithAwards.awards.threeStar && (
                      <span className="is-three-star">엽슐랭 3스타</span>
                    )}
                    {selectedStoreWithAwards.awards.cheese && <span>치즈상</span>}
                    {selectedStoreWithAwards.awards.sauce && <span>소스상</span>}
                    {selectedStoreWithAwards.awards.cooking && <span>익힘상</span>}
                  </div>
                )}

              <button
                type="button"
                className="store-detail-button"
                onClick={showStoreDetails}
              >
                지점 상세 보기
              </button>
            </div>
          )}
        </aside>

        <div className="view-toggle" aria-label="보기 방식 선택">
          <button
            type="button"
            className={viewMode === "map" ? "is-active" : ""}
            onClick={() => setViewMode("map")}
          >
            지도
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "is-active" : ""}
            onClick={() => setViewMode("list")}
          >
            리스트
          </button>
        </div>
      </div>

      {detailStore && (
        <StoreDetail
          store={detailStore}
          onBack={() => {
            setDetailStore(null);
            setReviewMessage("");
          }}
          onWriteReview={prepareReview}
          onEditReview={editReview}
          message={reviewMessage}
          reviewRefreshKey={reviewRefreshKey}
          onReviewsChanged={() =>
            setReviewRefreshKey((currentKey) => currentKey + 1)
          }
          onMemberRequired={onProfileClick}
          user={user}
        />
      )}

      {isMyPageOpen && user && (
        <MyPageModal
          user={user}
          profile={profile}
          refreshKey={reviewRefreshKey}
          onClose={() => setIsMyPageOpen(false)}
          onEditReview={editReview}
          onOpenStore={(store) => {
            setIsMyPageOpen(false);
            setReviewMessage("");
            setDetailStore(store);
          }}
          onReviewsChanged={() =>
            setReviewRefreshKey((currentKey) => currentKey + 1)
          }
          onProfileUpdated={onProfileUpdated}
          onLogout={async () => {
            const didLogout = await onLogout();
            if (didLogout) setIsMyPageOpen(false);
            return didLogout;
          }}
        />
      )}

      {isStoreSelectorOpen && (
        <StoreSelector
          stores={storesWithAwards}
          userPosition={userPosition}
          onBack={() => {
            setIsStoreSelectorOpen(false);
            setReviewEntrySource(null);
          }}
          onSelect={selectReviewStore}
        />
      )}

      {reviewStore && (
        <ReviewForm
          store={reviewStore}
          review={editingReview}
          onCancel={cancelReviewForm}
          onChangeStore={
            reviewEntrySource === "fab" && !editingReview
              ? changeReviewStore
              : undefined
          }
          onSuccess={completeReview}
        />
      )}
    </section>
  );
}

function App() {
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showMemberAccessModal, setShowMemberAccessModal] = useState(false);
  const [onboardingInitialStage, setOnboardingInitialStage] = useState("start");
  const [maniaAnswers, setManiaAnswers] = useState(null);

  // 처음 접속했을 때 로그인 여부 확인
  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);

      if (user) {
        await getProfile(user.id);
      }

      setLoading(false);
    }

    checkUser();

    // 로그인 / 로그아웃 상태가 변경되면 자동 반영
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (currentUser) {
        await getProfile(currentUser.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // profiles 테이블에서 회원정보 가져오기
  async function getProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("프로필 불러오기 실패:", error);
      return;
    }

    setProfile(data);
  }

  // 회원가입
  async function handleSignup(e) {
    e.preventDefault();
    setMessage("");

    if (!Array.isArray(maniaAnswers) || maniaAnswers.length !== 5) {
      setMessage("매니아 테스트를 통과한 후 회원가입을 진행해주세요.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          nickname,
          mania_answers: maniaAnswers,
        },
      },
    });

    if (error) {
      setMessage("회원가입 실패: " + error.message);
      return;
    }

    setMessage("");
    setShowSignupModal(false);
    setShowOnboarding(false);
    setManiaAnswers(null);

    console.log("회원가입 결과:", data);
  }

  // 로그인
  async function handleLogin(e) {
    e.preventDefault();
    setMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("로그인 실패: " + error.message);
      return;
    }

    setUser(data.user);
    await getProfile(data.user.id);

    setMessage("");
    setShowLoginModal(false);
    setShowSignupModal(false);
    setShowMemberAccessModal(false);
    setShowOnboarding(false);
    setOnboardingInitialStage("start");
    setManiaAnswers(null);
  }

  // 로그아웃
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage("로그아웃 실패: " + error.message);
      return false;
    }

    setUser(null);
    setProfile(null);
    setMessage("");
    setShowLoginModal(false);
    setShowSignupModal(false);
    setShowMemberAccessModal(false);
    setShowOnboarding(true);
    setOnboardingInitialStage("start");
    setManiaAnswers(null);
    return true;
  }

  function handleProfileClick() {
    if (!user) {
      setShowMemberAccessModal(true);
    }
  }

  function openLogin() {
    setEmail("");
    setPassword("");
    setShowOnboarding(false);
    setShowSignupModal(false);
    setShowMemberAccessModal(false);
    setShowLoginModal(true);
    setMessage("");
  }

  function startSignup(answers) {
    setManiaAnswers(answers);
    setMessage("");
    setShowOnboarding(false);
    setShowSignupModal(true);
    setShowLoginModal(false);
    setShowMemberAccessModal(false);
  }

  function cancelSignup() {
    setManiaAnswers(null);
    setMessage("");
    setShowSignupModal(false);
    setShowLoginModal(false);
    setShowOnboarding(true);
    setOnboardingInitialStage("start");
  }

  function openSignupFlow() {
    setMessage("");
    setShowMemberAccessModal(false);
    setShowLoginModal(false);
    setShowSignupModal(false);
    setOnboardingInitialStage("test");
    setShowOnboarding(true);
  }

  // 로그인 여부 확인 중
  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h2>엽슐랭 불러오는 중...</h2>
      </div>
    );
  }

  return (
    <>
      <YeopsulMap
        onProfileClick={handleProfileClick}
        user={user}
        profile={profile}
        onProfileUpdated={setProfile}
        onLogout={handleLogout}
      />

      {!user &&
        showOnboarding &&
        !showSignupModal &&
        !showLoginModal &&
        !showMemberAccessModal && (
        <div className="onboarding-overlay">
          <ManiaTest
            initialStage={onboardingInitialStage}
            onStartSignup={startSignup}
            onBrowse={() => {
              setShowOnboarding(false);
              setOnboardingInitialStage("start");
            }}
            onLogin={openLogin}
          />
        </div>
      )}

      {!user && showMemberAccessModal && (
        <div className="onboarding-overlay">
          <MemberAccessModal
            onClose={() => setShowMemberAccessModal(false)}
            onSignup={openSignupFlow}
            onLogin={openLogin}
          />
        </div>
      )}

      {!user && showSignupModal && (
        <div className="onboarding-overlay">
          <SignupModal
            username={username}
            nickname={nickname}
            email={email}
            password={password}
            message={message}
            onUsernameChange={(event) => setUsername(event.target.value)}
            onNicknameChange={(event) => setNickname(event.target.value)}
            onEmailChange={(event) => setEmail(event.target.value)}
            onPasswordChange={(event) => setPassword(event.target.value)}
            onSubmit={handleSignup}
            onCancel={cancelSignup}
          />
        </div>
      )}

      {!user && showLoginModal && (
        <div className="onboarding-overlay">
          <LoginModal
            email={email}
            password={password}
            message={message}
            onEmailChange={(event) => setEmail(event.target.value)}
            onPasswordChange={(event) => setPassword(event.target.value)}
            onEmailClear={() => setEmail("")}
            onPasswordClear={() => setPassword("")}
            onSubmit={handleLogin}
            onCancel={() => {
              setMessage("");
              setShowLoginModal(false);
              setOnboardingInitialStage("start");
              setShowOnboarding(true);
            }}
          />
        </div>
      )}
    </>
  );
}

export default App;
