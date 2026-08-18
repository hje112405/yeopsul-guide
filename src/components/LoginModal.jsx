import "./ManiaTest.css";

export default function LoginModal({
  email,
  password,
  message,
  onEmailChange,
  onPasswordChange,
  onEmailClear,
  onPasswordClear,
  onSubmit,
  onCancel,
}) {
  return (
    <div className="mania-modal-card" role="dialog" aria-modal="true">
      <p className="mania-eyebrow">기존 회원</p>
      <h2>로그인</h2>
      <form className="mania-signup-form" onSubmit={onSubmit}>
        <label>
          <span>이메일</span>
          <div className="mania-clearable-field">
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={onEmailChange}
              required
            />
            {email && (
              <button
                type="button"
                onClick={onEmailClear}
                aria-label="이메일 전체 삭제"
              >
                ×
              </button>
            )}
          </div>
        </label>
        <label>
          <span>비밀번호</span>
          <div className="mania-clearable-field">
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={onPasswordChange}
              required
            />
            {password && (
              <button
                type="button"
                onClick={onPasswordClear}
                aria-label="비밀번호 전체 삭제"
              >
                ×
              </button>
            )}
          </div>
        </label>
        {message && <p className="mania-error">{message}</p>}
        <button type="submit" className="mania-primary-button">
          로그인
        </button>
        <button type="button" className="mania-text-button" onClick={onCancel}>
          취소
        </button>
      </form>
    </div>
  );
}
