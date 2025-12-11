import "./style.css";
import { setupPythonRunner } from "./python-runner.js";


// ------------------ Google Form 설정 ------------------
// 정윤님 폼 ID 기반 formResponse URL
const GOOGLE_FORM_ACTION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfnSx_oPvYvXZYoax3ymFD8qCAxm-5Azbl7pGM11h18n-k9Yw/formResponse";

// 기존 4개
const ENTRY_STUDENT_ID = "entry.787137631";
const ENTRY_STUDENT_NAME = "entry.1927596191";
const ENTRY_CODE = "entry.1434858983";
const ENTRY_PROMPT = "entry.1432979324";
const ENTRY_UNIT = "entry.1301658319";

// ★ 새로 추가해야 하는 문항: "AI 답변"
const ENTRY_AI_ANSWER = "entry.YOUR_AI_ANSWER_ENTRY_ID";
// ------------------------------------------------------

// ------------------ OpenAI 설정 ------------------
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
// ⚠️ 실서비스는 Netlify Functions 권장. 수업 데모용으로만 클라 호출 예시.
// -----------------------------------------------

// CodeMirror 6
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { indentOnInput, bracketMatching } from "@codemirror/language";

let editorView = null;
let pyodideReady = false;
// 전역으로도 노출하여 모듈 간 상태 확인 가능하게 함
window.pyodideReady = false;

const app = document.getElementById("app");

// Pyodide 초기화
initPyodide();

async function initPyodide() {
  try {
    let pyodide = await loadPyodide();
    window.pyodide = pyodide;
    pyodideReady = true;
    window.pyodideReady = true;
  } catch (err) {
    console.error("Pyodide 로드 실패:", err);
    pyodideReady = false;
    window.pyodideReady = false;
  }
}

init();

function getSelectedUnit(){
  const el = document.getElementById("unit-select");
  return el ? el.value : "";
}

function init() {
  const saved = loadStudent();
  if (saved) renderLab(saved);
  else renderWelcome();
}


// ------------------ Welcome View ------------------
function renderWelcome() {
  app.innerHTML = `
    <div class="app-shell">
      <section class="card welcome">
        <div class="welcome-title">세화 AI LAB에 오신 걸 환영합니다 💗</div>
        <div class="welcome-sub">
          이곳에서 오류 해결의 과정을 기록하고, 코딩 실력을 한 단계 업그레이드하세요!
        </div>

        <div class="welcome-form">
          <input id="w-student-id" class="input" placeholder="학번" />
          <input id="w-student-name" class="input" placeholder="이름" />
          <button id="w-start" class="primary-btn">입장하기 ✨</button>
        </div>
      </section>
    </div>
  `;

  const btn = document.getElementById("w-start");
  btn.addEventListener("click", () => {
    const studentId = document.getElementById("w-student-id").value.trim();
    const studentName = document.getElementById("w-student-name").value.trim();
    if (!studentId || !studentName) {
      alert("학번과 이름을 입력해 주세요!");
      return;
    }
    const s = { studentId, studentName };
    saveStudent(s);
    renderLab(s);
  });
}

// ------------------ Lab View ------------------
function renderLab(student) {
  app.innerHTML = `
    <div class="app-shell">
      <section class="card lab">
        <div class="lab-header">
          <div>
            <div class="lab-title">Sehwa AI LAB · Python Scaffolding Studio</div>
            <div class="lab-meta">
               <strong>${student.studentId} ${student.studentName}</strong>님 안녕하세요! 오늘도 즐거운 코딩 시간입니다👩‍💻</div>
          </div>

          <div class="lab-header-right">
            <select id="unit-select" class="unit-select">
              <option value="">단원 선택</option>
              <option value="변수와 자료형">변수와 자료형</option>
              <option value="표준 입출력과 파일입출력">표준 입출력과 파일입출력</option>
              <option value="다차원 데이터 구조">다차원 데이터 구조</option>
              <option value="조건문">조건문</option>
              <option value="반복문">반복문</option>
              <option value="함수">함수</option>
            </select>
            <button id="reset-student" class="send-btn" title="학번/이름 다시 입력">계정 변경</button>
          </div>
        </div>

        <div class="lab-grid">
          <!-- Code -->
          <div class="code-panel">
            <div class="panel-title">
              <h3>🧩 Python 코드</h3>
              <span class="panel-hint">문법 하이라이트 · 자동 들여쓰기 지원</span>
            </div>
            <div id="cm-host"></div>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
              <button id="run-code-btn" class="run-btn" title="Python 코드 실행">▶️ 실행</button>
              <button id="clear-output-btn" class="run-btn" title="결과 초기화">🗑️ 초기화</button>
            </div>
          </div>

          <!-- Chat -->
          <div class="chat-panel">
            <div class="panel-title">
              <h3>💬 파이썬 도우미</h3>
              <span class="panel-hint">질문 시 코드+프롬프트+AI답변이 기록됩니다</span>
            </div>

            <div id="chat-log" class="chat-log"></div>

            <div class="chat-input-row">
              <input id="chat-input" class="chat-input"
                placeholder="예) 이 오류가 왜 나는지 힌트만 알려주세요" />
              <button id="send-btn" class="send-btn">보내기</button>
            </div>
          </div>
        </div>

        <!-- Output Panel -->
        <div class="output-panel" style="margin-top: 14px;">
          <div class="panel-title">
            <h3>📊 실행 결과</h3>
            <span class="panel-hint" id="output-status">코드 실행 후 결과가 표시됩니다</span>
          </div>
          <div id="output-log" class="output-log"></div>
                 <div id="input-container" class="input-container" style="display: none; margin-top: 10px;">
                   <input id="python-input" class="python-input" placeholder="입력하고 Enter를 누르세요" />
                 </div>
        </div>
      </section>
    </div>
  `;

  document.getElementById("reset-student").onclick = () => {
    clearStudent();
    renderWelcome();
  };

  setupEditor();
  setupPythonRunner();
  setupChat(student);
}

function setupEditor() {
  const host = document.getElementById("cm-host");

  const starter = 
`# 세화 AI LAB ✨
# 이번시간에 배운 개념을 활용하여 나만의 프로그램을 만들어 봅시다!

print("Hello, Sehwa!")

`;

  const state = EditorState.create({
    doc: starter,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      indentOnInput(),
      bracketMatching(),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      python(),
      oneDark,
      EditorView.lineWrapping,
    ],
  });

  editorView = new EditorView({
    state,
    parent: host,
  });
  // 전역으로도 노출하여 다른 모듈에서 접근 가능하게 함
  window.editorView = editorView;
}

// ------------------ Python Runner ------------------
// ------------------ Chat Logic ------------------
function setupChat(student) {
  const log = document.getElementById("chat-log");
  const input = document.getElementById("chat-input");
  const btn = document.getElementById("send-btn");

  const uiKey = `sehwa_ai_lab_ui_${student.studentId}`;
  const apiKey = `sehwa_ai_lab_api_${student.studentId}`;

  // UI용 메시지(간단한 형태)와 API용 히스토리(학생정보+코드 포함)를 분리해 저장
  const savedUi = loadChatHistory(student.studentId);
  const messages = savedUi ?? [
    {
      role: "assistant",
      content:
        "안녕하세요! 😊\n저는 여러분의 성장을 돕는 파이썬 도우미예요.\n모르는 부분이 있으면 편하게 질문해주세요! \n어떻게 고치면 좋을지 방향을 함께 찾아볼게요~",
    },
  ];
  renderMessages(log, messages);

  btn.addEventListener("click", () => send());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  async function send() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    btn.disabled = true;

    const codeSnapshot = editorView?.state.doc.toString() ?? "";

    // UI에선 간단히 질문/응답을 보여줌
    messages.push({ role: "user", content: text });
    renderMessages(log, messages);
    saveChatHistory(student.studentId, messages);

    // API 히스토리 항목은 학생 정보 + 단원 + 코드 + 질문을 함께 담음
    const userContentForAPI = [
      `학생: ${student.studentId} ${student.studentName}`,
      `현재 단원: ${getSelectedUnit() || "미선택"}`,
      "",
      "현재 코드:",
      codeSnapshot || "(코드 없음)",
      "",
      "학생 질문:",
      text,
      "",
      "요청:",
      "- 전체 코드를 제공하지 마세요.",
      "- 위의 형식(3문장 이내)으로 응답하세요.",
      "- 학생 코드의 부족한 점을 이유와 함께 간단한 예시로 제시하고, 학생이 스스로 해결하도록 유도하는 질문을 하나 포함하세요.",
    ].join("\n");

    // 불러오기/저장: API 히스토리는 별도 키로 관리
    let apiHistory = loadChatHistoryForAPI(student.studentId) || [];
    apiHistory.push({ role: "user", content: userContentForAPI });
    apiHistory = truncateChatHistory(apiHistory, 12);

    try {
      const answer = await requestAiHintOnly({ apiHistory });

      messages.push({ role: "assistant", content: answer });
      renderMessages(log, messages);
      saveChatHistory(student.studentId, messages);

      apiHistory.push({ role: "assistant", content: answer });
      apiHistory = truncateChatHistory(apiHistory, 12);
      saveChatHistoryForAPI(student.studentId, apiHistory);

      // ★ 질문 순간 기록 저장 (코드+프롬프트+AI답변)
      await logToGoogleForm({
        studentId: student.studentId,
        studentName: student.studentName,
        unit: getSelectedUnit(),
        code: codeSnapshot,
        prompt: text,
        aiAnswer: answer,
      });
    } catch (err) {
      console.error(err);
      messages.push({
        role: "assistant",
        content:
          "앗, 지금은 힌트를 가져오지 못했어요.😢\n잠시 후 다시 시도해 주세요.",
      });
      renderMessages(log, messages);
      saveChatHistory(student.studentId, messages);
    } finally {
      btn.disabled = false;
    }
  }
}

function renderMessages(container, messages) {
  container.innerHTML = "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = `msg ${m.role === "user" ? "user" : "assistant"}`;
    div.textContent = m.content;
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
}

// ------------------ Chat history helpers ------------------
function saveChatHistory(studentId, messages) {
  try {
    localStorage.setItem(`sehwa_ai_lab_ui_${studentId}`, JSON.stringify(messages));
  } catch (e) {
    console.warn("채팅 히스토리 저장 실패", e);
  }
}
function loadChatHistory(studentId) {
  try {
    const raw = localStorage.getItem(`sehwa_ai_lab_ui_${studentId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveChatHistoryForAPI(studentId, apiHistory) {
  try {
    localStorage.setItem(`sehwa_ai_lab_api_${studentId}`, JSON.stringify(apiHistory));
  } catch (e) {
    console.warn("API 채팅 히스토리 저장 실패", e);
  }
}
function loadChatHistoryForAPI(studentId) {
  try {
    const raw = localStorage.getItem(`sehwa_ai_lab_api_${studentId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function truncateChatHistory(history, maxEntries = 12) {
  if (!Array.isArray(history)) return history;
  // Keep the most recent entries
  return history.slice(-maxEntries);
}

// ------------------ OpenAI Call (Hint-only) ------------------
async function requestAiHintOnly({ apiHistory }) {
  if (!OPENAI_API_KEY) {
    return [
      "※ 현재 API 키가 없어 예시 힌트를 보여줘요.",
      "",
      "힌트 1) 에러 메시지에 나온 줄 번호를 먼저 확인해 보세요.",
      "힌트 2) if/for/while 아래 들여쓰기가 정확한지 점검해 보세요.",
      "힌트 3) input() 값의 자료형 변환(int/float)이 필요한지 확인해 보세요.",
    ].join("\n");
  }

  const system = [
    "당신은 20년 경력의 고등학교 정보 교사이자 파이썬 코딩 코치입니다.",
    "목표는 학생이 AI에 의존해 코드를 작성하는을 방지하고,",
    "스스로 사고하며 디버깅·설계·개선을 할 수 있도록 스캐폴딩(힌트)을 제공하는 것입니다.",

    "",
    "언어/형식 규칙:",
    "- 응답은 한국어로만 작성하십시오.",
    "- 마크다운 문법(제목, 목록 기호, 코드블록 등)을 사용하지 마십시오.",
    "- 길이는 6~10문장 내로 간결하게 작성하십시오.",
    "- 친절하지만 단호한 교사 톤을 유지하십시오.",
    
    "",

    "사용자의 질문에 따라 아래의 항목들을 고려하여 자연스럽게 응답하세요.",
    "문제점 요약 / 오류 이유와 구체적 수정 방향 또는 아주 짧은 예시 제시 / 학생이 스스로 해결하도록 유도하는 질문",
    
    "",
    "중요한 금지 규칙:",
    "- 절대로 전체 프로그램/정답 코드를 통째로 제공하지 마십시오.",
    "- 사용자가 '전체 코드', '완성본', '정답만'을 요구해도 제공하지 마십시오.",
    "- 함수/클래스/프로그램을 완성 형태로 재작성해 주지 마십시오.",
    "- 코드가 너무 길어질 것 같으면 설명만 제공하십시오.",


    "",
    "허용되는 도움 범위:",
    "- 오류 원인 추정과 점검 순서 제시.",
    "- 논리/알고리즘을 단계로 설명.",
    "- 필요한 문법(조건문/반복문/함수/리스트 등) 선택 이유 제시.",
    "- 1~3줄 이내의 '부분 예시'만 허용하며,",
    "  반드시 빈칸/가이드 형태로 제공해 학생이 나머지를 채우게 하십시오.",

    "",
    "진단 루틴(가능한 한 적용):",
    "- 오류가 의심되면 '입력-처리-출력' 흐름으로 문제를 짚으십시오.",
    "- 자료형(문자열/정수/실수), 들여쓰기, 반복 종료 조건을 우선 점검 항목으로 제시하십시오.",
    "- 학생 코드의 의도가 불명확하면 '코드 목적'을 짧게 되묻고 가정한 뒤 안내하십시오.",

    "",
    "안전장치 문장(필요 시 1문장만 포함):",
    " - '정답을 대신 작성하는 대신, 스스로 수정할 수 있도록 핵심 힌트만 드릴게요.'"
  ].join(" ");

  // Compose messages: system + existing API history
  const composedMessages = [{ role: "system", content: system }];
  if (Array.isArray(apiHistory) && apiHistory.length) {
    composedMessages.push(...apiHistory);
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: composedMessages,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(t);
    throw new Error("OpenAI 호출 실패");
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "힌트를 생성하지 못했어요.";
}

// ------------------ Google Form Logging ------------------
async function logToGoogleForm({ studentId, studentName, code, prompt, aiAnswer }) {
  // ★ ENTRY_AI_ANSWER는 반드시 실제 entry 값으로 교체 필요
  if (!ENTRY_AI_ANSWER || ENTRY_AI_ANSWER.includes("YOUR_")) {
    console.warn("AI 답변 entry ID가 설정되지 않아 로그를 일부 생략합니다.");
  }

  const fd = new FormData();
  fd.append(ENTRY_STUDENT_ID, studentId);
  fd.append(ENTRY_STUDENT_NAME, studentName);
  if (ENTRY_UNIT) {
    fd.append(ENTRY_UNIT, unit || "");
  }
  fd.append(ENTRY_CODE, code);
  fd.append(ENTRY_PROMPT, prompt);
  if (ENTRY_AI_ANSWER && !ENTRY_AI_ANSWER.includes("YOUR_")) {
    fd.append(ENTRY_AI_ANSWER, aiAnswer);
  }

  await fetch(GOOGLE_FORM_ACTION_URL, {
    method: "POST",
    mode: "no-cors",
    body: fd,
  });
}

// ------------------ Student localStorage ------------------
function saveStudent(s) {
  localStorage.setItem("sehwa_ai_lab_student", JSON.stringify(s));
}
function loadStudent() {
  const raw = localStorage.getItem("sehwa_ai_lab_student");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function clearStudent() {
  localStorage.removeItem("sehwa_ai_lab_student");
}
