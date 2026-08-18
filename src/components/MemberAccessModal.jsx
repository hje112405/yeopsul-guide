import { CloseIcon } from "./Icons";
import "./ManiaTest.css";

export default function MemberAccessModal({ onClose, onSignup, onLogin }) {
  return (
    <div
      className="mania-modal-card mania-start-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-access-title"
    >
      <button
        type="button"
        className="mania-test-close"
        onClick={onClose}
        aria-label="회원 전용 기능 안내 닫기"
      >
        <CloseIcon />
      </button>
      <h2 id="member-access-title">회원만 사용할 수 있는 기능이에요</h2>
      <p className="mania-description">
        리뷰 작성과 마이페이지는 회원가입 또는 로그인이 필요해요.
      </p>
      <button type="button" className="mania-primary-button" onClick={onSignup}>
        회원가입
      </button>
      <button type="button" className="mania-secondary-button" onClick={onLogin}>
        기존 회원 로그인
      </button>
    </div>
  );
}
