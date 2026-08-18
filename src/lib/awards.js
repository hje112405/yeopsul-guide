export const AWARD_MIN_REVIEW_COUNT = 5;
export const AWARD_MIN_AVERAGE = 4.5;

export function calculateAverage(reviews, fieldName) {
  const scores = reviews
    .map((review) => review[fieldName])
    .filter((score) => score !== null && Number.isFinite(Number(score)))
    .map(Number);

  if (scores.length === 0) return null;

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function calculateStoreAwards(reviews) {
  const averages = {
    cheese: calculateAverage(reviews, "cheese_rating"),
    sauce: calculateAverage(reviews, "sauce_rating"),
    cooking: calculateAverage(reviews, "cooking_rating"),
  };
  const isEligible = reviews.length >= AWARD_MIN_REVIEW_COUNT;
  const cheese =
    isEligible &&
    averages.cheese !== null &&
    averages.cheese >= AWARD_MIN_AVERAGE;
  const sauce =
    isEligible &&
    averages.sauce !== null &&
    averages.sauce >= AWARD_MIN_AVERAGE;
  const cooking =
    isEligible &&
    averages.cooking !== null &&
    averages.cooking >= AWARD_MIN_AVERAGE;

  return {
    reviewCount: reviews.length,
    isEligible,
    averages,
    cheese,
    sauce,
    cooking,
    threeStar: cheese && sauce && cooking,
  };
}
