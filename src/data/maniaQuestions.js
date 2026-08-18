export const MANIA_QUESTIONS = [
  {
    id: "q1",
    prompt: "다음 중 가장 적절한 소스 농도는?",
    options: [1, 2, 3].map((value) => ({
      value,
      image: `q1-${value}.webp`,
      label: `${value}번`,
    })),
  },
  {
    id: "q2",
    prompt: "다음 중 익힘 정도가 가장 적절한 분모자는?",
    options: [1, 2, 3].map((value) => ({
      value,
      image: `q2-${value}.webp`,
      label: `${value}번`,
    })),
  },
  {
    id: "q3",
    prompt:
      "엽기떡볶이는 어묵을 한 차례 리뉴얼하였습니다. 다음 중 리뉴얼 후의 어묵은?",
    options: [1, 2].map((value) => ({
      value,
      image: `q3-${value}.webp`,
      label: `${value}번`,
    })),
  },
  {
    id: "q4",
    prompt: "다음 중 엽기떡볶이에서 출시된 적 없는 메뉴는?",
    options: [
      { value: 1, label: "치즈죽" },
      { value: 2, label: "짜장떡볶이" },
      { value: 3, label: "로제떡볶이" },
      { value: 4, label: "해물떡볶이" },
    ],
  },
  {
    id: "q5",
    prompt: "바삭치즈만두와 퐁당치즈만두의 차이는 다음 중 무엇인가요?",
    options: [
      {
        value: 1,
        label:
          "바치만과 퐁치만은 만두 속 재료가 바삭한지 부드러운지의 차이이다.",
      },
      {
        value: 2,
        label: "바치만과 퐁치만은 같은 만두이지만, 제공 방식의 차이이다.",
      },
      {
        value: 3,
        label:
          "만두 안에 엽떡에서 자체 제작한 바삭치즈가 들어가느냐, 퐁당치즈가 들어가느냐의 차이이다.",
      },
    ],
  },
];
