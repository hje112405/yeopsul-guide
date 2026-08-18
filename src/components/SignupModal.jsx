function SignupModal({
  username,
  nickname,
  email,
  password,
  message,
  onUsernameChange,
  onNicknameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onCancel,
}) {
  return (
    <div className="mania-modal-card">
      <p className="mania-eyebrow">매니아 테스트 통과</p>
      <h2>회원가입</h2>
      <form className="mania-signup-form" onSubmit={onSubmit}>
        <label>
          <span>아이디</span>
          <input value={username} onChange={onUsernameChange} required />
        </label>
        <label>
          <span>닉네임</span>
          <input value={nickname} onChange={onNicknameChange} required />
        </label>
        <label>
          <span>이메일</span>
          <input type="email" value={email} onChange={onEmailChange} required />
        </label>
        <label>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={onPasswordChange}
            required
          />
        </label>
        {message && <p className="mania-error">{message}</p>}
        <button type="submit" className="mania-primary-button">
          가입하기
        </button>
        <button type="button" className="mania-text-button" onClick={onCancel}>
          가입 취소
        </button>
      </form>
    </div>
  );
}

export default SignupModal;
