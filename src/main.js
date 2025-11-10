// src/main.js
// ──────────────────────────────────────────────────────────────
// ⚠️ 보안 주의: 프런트에서 직접 API Key 사용은 노출됩니다(학습/프로토타입 용도).
//    프로덕션에서는 서버 프록시 사용 권장.
// ──────────────────────────────────────────────────────────────
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// 뷰 엘리먼트
const viewHome   = document.getElementById("view-home");
const viewQuiz   = document.getElementById("view-quiz");
const viewResult = document.getElementById("view-result");
const viewReflect= document.getElementById("view-reflect"); // ✅ 성찰 제출 화면

// 홈(주제) 버튼들
viewHome.querySelectorAll("button[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => startQuiz(btn.dataset.mode));
});

// 퀴즈쪽 엘리먼트
const modeLabel  = document.getElementById("modeLabel");
const qNumEl     = document.getElementById("qNum");
const scoreEl    = document.getElementById("score");
const questionEl = document.getElementById("question");
const metaEl     = document.getElementById("meta");
const answerEl   = document.getElementById("answer");
const feedbackEl = document.getElementById("feedback");
const checkBtn   = document.getElementById("checkBtn");
const revealBtn  = document.getElementById("revealBtn");
const nextBtn    = document.getElementById("nextBtn");
const endBtn     = document.getElementById("endBtn");
const hintBtn    = document.getElementById("hintBtn");

// 결과쪽 엘리먼트
const resultText = document.getElementById("resultText");
const retryBtn   = document.getElementById("retryBtn");
const homeBtn    = document.getElementById("homeBtn");

// 챗봇 엘리먼트
const chatLog   = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const sendBtn   = document.getElementById("sendBtn");

// ✅ 성찰 제출 엘리먼트
const refName     = document.getElementById("refName");
const refSid      = document.getElementById("refSid");
const refLearned  = document.getElementById("refLearned");
const reflectMsg  = document.getElementById("reflectMsg");
const reflectSubmitBtn = document.getElementById("reflectSubmitBtn");
const reflectSkipBtn   = document.getElementById("reflectSkipBtn");

// 상태
const MODE_LABELS = {
  "bin-dec": "2진수 ➜ 10진수",
  "dec-bin": "10진수 ➜ 2진수",
  "bin-oct": "2진수 ➜ 8진수",
  "bin-hex": "2진수 ➜ 16진수",
};

let session = {
  mode: "bin-dec",
  total: 15,
  index: 1,
  score: 0,
  answered: false,
  current: { prompt: "", answer: "", meta: "" },
};

// ✅ 성찰 화면 노출 제어용
let attempts = 0;               // 한 문제라도 시도했는지
let shouldShowReflect = false;  // 홈으로 갈 때 성찰 먼저 보일지

// 뷰 전환
function show(view) {
  [viewHome, viewQuiz, viewResult, viewReflect].forEach(v => v.classList.remove("active"));
  view.classList.add("active");
  if (view === viewQuiz) { answerEl.focus(); }
}

// 난수 유틸
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 진법 유틸
function toBin(n) { return n.toString(2); }
function toOct(n) { return n.toString(8); }
function toHex(n) { return n.toString(16).toUpperCase(); }
function fromBin(s) { return parseInt(s, 2); }

// 앞 0 없이 이진수 만들기 (b비트, 맨앞 1 보장)
function randomBinaryBits(b) {
  const head = "1";
  let rest = "";
  for (let i = 1; i < b; i++) rest += Math.random() < 0.5 ? "0" : "1";
  return head + rest;
}

// 문제 생성: mode별
function makeQuestion(mode) {
  switch (mode) {
    case "bin-dec": {
      const bits = randInt(4, 8);
      const bin = randomBinaryBits(bits);
      const dec = fromBin(bin);
      return {
        prompt: `다음 2진수를 10진수로 변환하세요:  ${bin} (2) = ? (10)`,
        answer: String(dec),
        meta: `비트 수: ${bits}`,
        askHint: `2진수 ${bin}을(를) 10진수로 바꾸는 과정을 단계별로 설명해줘.`,
      };
    }
    case "dec-bin": {
      const dec = randInt(5, 255); // 3~8비트 범위
      const bin = toBin(dec);
      return {
        prompt: `다음 10진수를 2진수로 변환하세요:  ${dec} (10) = ? (2)  (앞의 0은 생략)`,
        answer: bin,
        meta: `정답 비트 수: ${bin.length}`,
        askHint: `10진수 ${dec}을(를) 2진수로 바꾸는 과정을 단계별로 설명해줘.`,
      };
    }
    case "bin-oct": {
      const bits = randInt(6, 12); // 6~12비트 정도
      const bin = randomBinaryBits(bits);
      const oct = toOct(fromBin(bin));
      return {
        prompt: `다음 2진수를 8진수로 변환하세요:  ${bin} (2) = ? (8)`,
        answer: oct,
        meta: `비트 수: ${bits} (3비트씩 묶어 변환)`,
        askHint: `2진수 ${bin}을(를) 8진수로 바꾸는 법(3비트씩 묶기)을 단계별로 설명해줘.`,
      };
    }
    case "bin-hex": {
      const bits = randInt(4, 12); // 4~12비트
      const bin = randomBinaryBits(bits);
      const hex = toHex(fromBin(bin));
      return {
        prompt: `다음 2진수를 16진수로 변환하세요:  ${bin} (2) = ? (16)  (A~F는 대문자)`,
        answer: hex,
        meta: `비트 수: ${bits} (4비트씩 묶어 변환)`,
        askHint: `2진수 ${bin}을(를) 16진수로 바꾸는 법(4비트씩 묶기)을 단계별로 설명해줘. 16진수는 대문자로.`,
      };
    }
    default:
      throw new Error("알 수 없는 모드");
  }
}

// 입력 정규화(공백 제거/대문자화)
function normalizeInput(s) {
  return (s ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

// 정답 체크(모드별 허용 형식 포함)
function isCorrect(mode, user, answer) {
  const u = normalizeInput(user);
  const a = normalizeInput(answer);

  if (mode === "bin-dec") {
    if (!/^\d+$/.test(u)) return false;
    return u === a;
  }
  if (mode === "dec-bin") {
    if (!/^[01]+$/.test(u)) return false;
    const strip = s => s.replace(/^0+/, "") || "0";
    return strip(u) === strip(a);
  }
  if (mode === "bin-oct") {
    if (!/^[0-7]+$/.test(u)) return false;
    const strip = s => s.replace(/^0+/, "") || "0";
    return strip(u) === strip(a);
  }
  if (mode === "bin-hex") {
    if (!/^[0-9A-F]+$/i.test(user.trim())) return false;
    const strip = s => s.replace(/^0+/, "") || "0";
    return strip(u) === strip(a);
  }
  return false;
}

// 퀴즈 화면 갱신
function updateQuizView() {
  modeLabel.textContent = MODE_LABELS[session.mode];
  qNumEl.textContent = session.index;
  scoreEl.textContent = session.score;

  questionEl.textContent = session.current.prompt;
  metaEl.textContent = session.current.meta;
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  answerEl.value = "";
  answerEl.focus();
}

// 새 문제
function newQuestion() {
  session.current = makeQuestion(session.mode);
  session.answered = false;
  updateQuizView();
}

// 퀴즈 시작
function startQuiz(mode) {
  session.mode = mode;
  session.total = 15;
  session.index = 1;
  session.score = 0;
  newQuestion();
  show(viewQuiz);
}

// 정답 확인
function checkAnswer() {
  const user = answerEl.value;
  if (!user.trim()) {
    feedbackEl.textContent = "값을 입력해 주세요.";
    feedbackEl.className = "feedback bad";
    return;
  }

  attempts += 1; // ✅ 최소 1회 시도 기록

  if (isCorrect(session.mode, user, session.current.answer)) {
    if (!session.answered) session.score += 1;
    feedbackEl.textContent = "정답입니다! 🎉";
    feedbackEl.className = "feedback ok";
    session.answered = true;
    scoreEl.textContent = session.score;
  } else {
    feedbackEl.innerHTML = `아惜! 오답입니다. <strong>${normalizeInput(user)}</strong> ≠ <strong>${normalizeInput(session.current.answer)}</strong>`;
    feedbackEl.className = "feedback bad";
  }
}

// 정답 보기
function revealAnswer() {
  attempts += 1; // ✅ 시도 기록
  feedbackEl.innerHTML = `정답: <strong>${normalizeInput(session.current.answer)}</strong>`;
  feedbackEl.className = "feedback";
  session.answered = true;
}

// 다음 문제 or 결과
function nextQuestion() {
  if (session.index >= session.total) {
    resultText.textContent = `총점: ${session.score} / ${session.total}`;
    show(viewResult);
    return;
  }
  session.index += 1;
  newQuestion();
}

// 종료(중간 포기)
function endQuiz() {
  resultText.textContent = `총점: ${session.score} / ${session.total} (중간 종료)`;
  show(viewResult);
}

// 결과에서 다시/홈
retryBtn.addEventListener("click", () => {
  startQuiz(session.mode);
});

// ✅ 홈 이동 시 성찰 화면 먼저 보여주기
homeBtn.addEventListener("click", handleGoHome);

function handleGoHome() {
  if (attempts > 0) {
    shouldShowReflect = true;
    // 자동 문장 힌트(비어있으면)
    if (!refLearned.value.trim()) {
      const label = MODE_LABELS[session.mode] || "진법 변환";
      refLearned.value = `오늘 ${label}를(을) 연습하며 개념을 이해했다.`;
    }
    show(viewReflect);
  } else {
    show(viewHome);
  }
}

// 이벤트 바인딩
checkBtn.addEventListener("click", checkAnswer);
revealBtn.addEventListener("click", revealAnswer);
nextBtn.addEventListener("click", nextQuestion);
endBtn.addEventListener("click", endQuiz);

// 단축키
answerEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkAnswer();
});
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "r") revealAnswer();
  if (k === "n") nextQuestion();
});

// ──────────────────────────────────────────────────────────────
// 미니 챗봇
// ──────────────────────────────────────────────────────────────
function appendMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "bot"}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function askGPT(userText) {
  if (!OPENAI_API_KEY) {
    appendMsg("bot", "환경변수 VITE_OPENAI_API_KEY가 설정되어 있지 않습니다. .env를 확인해주세요.");
    return;
  }
  appendMsg("user", userText);

  const systemPrompt = `
너는 학생에게 진법 변환(2↔10, 2→8, 2→16)을 단계적으로 설명하는 튜터야.
- 2→10: 가중치(2^k) 합산을 표기
- 10→2: 나눗셈/나머지 또는 2의 거듭제곱 채우기
- 2→8: 3비트 묶기
- 2→16: 4비트 묶기, A~F 대문자
풀이식을 깔끔히 보여줘.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("OpenAI API error:", err);
      appendMsg("bot", `API 오류가 발생했어요. 상태코드 ${res.status}`);
      return;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "(응답이 비어있어요)";
    appendMsg("bot", text);
  } catch (e) {
    console.error(e);
    appendMsg("bot", "네트워크 오류가 발생했어요. 콘솔을 확인해주세요.");
  }
}

sendBtn.addEventListener("click", () => {
  const t = chatInput.value.trim();
  if (!t) return;
  chatInput.value = "";
  askGPT(t);
});

// 현재 문제를 바로 질문으로
hintBtn.addEventListener("click", () => {
  const t = session.current.askHint || "이 문제 풀이를 단계적으로 설명해줘.";
  askGPT(t);
});

// ──────────────────────────────────────────────────────────────
// 성찰 제출: Google Form 전송(no-cors)
// ──────────────────────────────────────────────────────────────
const FORM_ACTION_REFLECT =
  "https://docs.google.com/forms/d/e/1FAIpQLSf4vcsq9y2Hbrs42rlYdBaIpiTwYDIq1a0XbZAGGH_o9mPP0Q/formResponse";

async function postReflectionToGoogleForm({ name, sid, learned }) {
  const params = new URLSearchParams();

  // 사용자 제공 entry 포인트
  params.append("entry.1000037525", name ?? "");   // 이름
  params.append("entry.241800951",  sid ?? "");    // 학번
  params.append("entry.298032889",  learned ?? "");// 배운내용

  // 최신 폼 호환용 숨은 필드
  params.append("fvv", "1");
  params.append("pageHistory", "0");
  params.append("fbzx", Date.now().toString());
  params.append("submit", "Submit");

  // no-cors: Opaque 응답 → 에러 없으면 성공 처리
  await fetch(FORM_ACTION_REFLECT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: params
  });
}

// 성찰 제출/건너뛰기 버튼
reflectSubmitBtn.addEventListener("click", async () => {
  const name = refName.value.trim();
  const sid  = refSid.value.trim();
  const learned = refLearned.value.trim();

  reflectMsg.textContent = "";
  if (!name || !sid || !learned) {
    reflectMsg.textContent = "이름/학번/배운 내용을 모두 입력해 주세요.";
    return;
  }

  reflectSubmitBtn.disabled = true;
  reflectMsg.textContent = "전송 중…";

  try {
    await postReflectionToGoogleForm({ name, sid, learned });
    refLearned.value = "";
    reflectMsg.textContent = "제출되었습니다! 메인으로 이동합니다.";
    shouldShowReflect = false; // 다음에는 바로 메인
    setTimeout(() => show(viewHome), 600);
  } catch (e) {
    console.error(e);
    reflectMsg.textContent = "전송 중 오류가 발생했습니다. 네트워크를 확인해 주세요.";
  } finally {
    reflectSubmitBtn.disabled = false;
  }
});

reflectSkipBtn.addEventListener("click", () => {
  shouldShowReflect = false;
  show(viewHome);
});

// 해시 라우팅(선택)
window.addEventListener("hashchange", syncFromHash);
function syncFromHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash) { show(viewHome); return; }
  const [path, param] = hash.split("/");
  if (path === "quiz" && MODE_LABELS[param]) {
    startQuiz(param);
  } else if (path === "result") {
    show(viewResult);
  } else {
    show(viewHome);
  }
}
// 초기 진입시 해시 반영
syncFromHash();
