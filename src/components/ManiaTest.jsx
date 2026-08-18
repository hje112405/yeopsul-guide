import { useState } from "react";
import { supabase } from "../lib/supabase";
import { MANIA_QUESTIONS } from "../data/maniaQuestions";
import "./ManiaTest.css";

const imageModules = import.meta.glob(
  "../assets/mania-test/*.{png,jpg,jpeg,webp}",
  { eager: true, query: "?url", import: "default" },
);

function getImageUrl(fileName) {
  const matchingPath = Object.keys(imageModules).find((path) =>
    path.endsWith(`/${fileName}`),
  );

  return matchingPath ? imageModules[matchingPath] : null;
}

function ManiaTest({ onStartSignup, onBrowse, onLogin }) {
  const [stage, setStage] = useState("start");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState(Array(MANIA_QUESTIONS.length).fill(null));
  const [score, setScore] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const question = MANIA_QUESTIONS[currentQuestionIndex];
  const selectedAnswer = answers[currentQuestionIndex];
  const passed = score !== null && score >= 3;

  function chooseAnswer(value) {
    setAnswers((currentAnswers) =>
      currentAnswers.map((answer, index) =>
        index === currentQuestionIndex ? value : answer,
      ),
    );
  }

  function retryTest() {
    setAnswers(Array(MANIA_QUESTIONS.length).fill(null));
    setCurrentQuestionIndex(0);
    setScore(null);
    setErrorMessage("");
    setStage("test");
  }

  async function submitAnswers() {
    if (answers.some((answer) => answer === null)) return;

    setIsChecking(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("evaluate_mania_test", {
      answer_values: answers,
    });

    setIsChecking(false);

    if (error) {
      setErrorMessage(
        "테스트 결과를 확인하지 못했습니다. Supabase SQL 적용 여부를 확인해주세요.",
      );
      return;
    }

    setScore(data);
    setStage("result");
  }

  if (stage === "start") {
    return (
      <div className="mania-modal-card">
        <p className="mania-eyebrow">엽슐랭가이드</p>
        <h2>나는 엽떡 매니아일까?</h2>
        <p className="mania-description">
          5문항 중 3문항 이상 맞히면 회원가입을 진행할 수 있어요.
        </p>
        <button type="button" className="mania-primary-button" onClick={() => setStage("test")}>
          매니아 테스트 시작
        </button>
        <button type="button" className="mania-secondary-button" onClick={onLogin}>
          기존 회원 로그인
        </button>
        <button type="button" className="mania-text-button" onClick={onBrowse}>
          비회원으로 둘러보기
        </button>
      </div>
    );
  }

  if (stage === "result") {
    return (
      <div className="mania-modal-card">
        <p className="mania-progress">결과 {score} / 5</p>
        <h2>{passed ? "매니아 테스트 통과!" : "아쉽게도 매니아 인증에 실패했어요."}</h2>
        {passed ? (
          <>
            <p className="mania-description">회원가입을 진행해주세요.</p>
            <button
              type="button"
              className="mania-primary-button"
              onClick={() => onStartSignup(answers)}
            >
              회원가입 하기
            </button>
          </>
        ) : (
          <>
            <button type="button" className="mania-primary-button" onClick={onBrowse}>
              비회원으로 둘러보기
            </button>
            <button type="button" className="mania-secondary-button" onClick={retryTest}>
              다시 도전하기
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mania-modal-card mania-question-card">
      <p className="mania-progress">
        {currentQuestionIndex + 1} / {MANIA_QUESTIONS.length}
      </p>
      <h2>{question.prompt}</h2>

      <div className={`mania-options ${question.options[0].image ? "image-options" : "text-options"}`}>
        {question.options.map((option) => {
          const imageUrl = option.image ? getImageUrl(option.image) : null;

          return (
            <button
              type="button"
              key={option.value}
              className={selectedAnswer === option.value ? "is-selected" : ""}
              onClick={() => chooseAnswer(option.value)}
              aria-pressed={selectedAnswer === option.value}
            >
              {option.image && (
                imageUrl ? (
                  <img src={imageUrl} alt={`${question.id} ${option.label} 선택지`} />
                ) : (
                  <span className="mania-image-placeholder">{option.image}</span>
                )
              )}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      {errorMessage && <p className="mania-error">{errorMessage}</p>}

      <div className="mania-navigation">
        <button
          type="button"
          className="mania-secondary-button"
          onClick={() => setCurrentQuestionIndex((index) => index - 1)}
          disabled={currentQuestionIndex === 0}
        >
          이전
        </button>
        {currentQuestionIndex < MANIA_QUESTIONS.length - 1 ? (
          <button
            type="button"
            className="mania-primary-button"
            onClick={() => setCurrentQuestionIndex((index) => index + 1)}
            disabled={selectedAnswer === null}
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            className="mania-primary-button"
            onClick={submitAnswers}
            disabled={selectedAnswer === null || isChecking}
          >
            {isChecking ? "채점 중..." : "제출"}
          </button>
        )}
      </div>
    </div>
  );
}

export default ManiaTest;
