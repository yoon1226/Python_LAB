import "./style.css";
import { setupPythonRunner } from "./python-runner.js";


// ------------------ Google Form 설정 ------------------
// 정윤님 폼 ID 기반 formResponse URL
const GOOGLE_FORM_ACTION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfnSx_oPvYvXZYoax3ymFD8qCAxm-5Azbl7pGM11h18n-k9Yw/formResponse";

// 응답
const ENTRY_STUDENT_ID = "entry.787137631"; //학생 학번
const ENTRY_STUDENT_NAME = "entry.1927596191"; //학생 이름
const ENTRY_UNIT = "entry.1301658319"; // 단원명
const ENTRY_CODE = "entry.1434858983"; //학생 코드
const ENTRY_PROMPT = "entry.1432979324"; //프롬프트
const ENTRY_AI_ANSWER = "entry.2110789571"; //AI 답변
const ENTRY_REFLECTION = "entry.920895731"; //학생 회고 

// ------------------------------------------------------

// Helper: 안전한 브라우저 폼 제출 (fetch no-cors 대신 사용)
function submitFormPost(url, fields = {}) {
  try {
    // 보이지 않는 iframe을 생성하여 폼 제출 시 현재 페이지가 이동하지 않도록 함
    const iframeName = `gf_iframe_${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.target = iframeName;
    form.style.display = "none";
    Object.keys(fields).forEach((k) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = fields[k] == null ? "" : String(fields[k]);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();

    // 정리: 폼/iframe을 잠시 후 제거
    setTimeout(() => {
      try { form.remove(); } catch (e) {}
      try { iframe.remove(); } catch (e) {}
    }, 2000);
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}

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
import { indentOnInput, bracketMatching, indentService } from "@codemirror/language";

let editorView = null;
let pyodideReady = false;
// 전역으로도 노출하여 모듈 간 상태 확인 가능하게 함
window.pyodideReady = false;

const app = document.getElementById("app");

// Pyodide 초기화
initPyodide();

async function initPyodide() {
  try {
    // loadPyodide 함수는 외부 스크립트에서 주입됩니다. Netlify와 같은 환경에서는
    // main 모듈이 실행될 때 외부 스크립트가 아직 로드되지 않아 `loadPyodide`가
    // undefined일 수 있으므로, 스크립트의 load 이벤트를 기다린 뒤 호출합니다.
    if (typeof loadPyodide === "undefined") {
      const script = document.querySelector('script[src*="pyodide"]');
      if (script) {
        await new Promise((resolve) => {
          if (script.readyState) {
            // old IE (unlikely) fallback
            script.onreadystatechange = function () {
              if (this.readyState === 'loaded' || this.readyState === 'complete') {
                resolve();
              }
            };
          } else {
            script.addEventListener('load', () => resolve());
            script.addEventListener('error', () => resolve());
          }
        });
      } else {
        // 스크립트 태그가 없으면 잠깐 폴링으로 기다려본다 (극히 드문 경우)
        let attempts = 0;
        while (typeof loadPyodide === "undefined" && attempts < 30) {
          // 100ms * 30 = 3초
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
      }
    }

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
  const el = document.getElementById("unit-select") || document.getElementById("w-unit-select");
  if (el) return el.value;
  const s = loadStudent();
  return s && s.unit ? s.unit : "";
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
          <input id="w-student-id" class="input" placeholder="학번" inputmode="numeric" pattern="[0-9]+" />
          <input id="w-student-name" class="input" placeholder="이름" />
          <select id="w-unit-select" class="unit-select">
            <option value="">학습 단원</option>
            <option value="변수와 자료형">변수와 자료형</option>
            <option value="표준입출력과 파일입출력">표준 입출력과 파일입출력</option>
            <option value="다차원 데이터 구조">다차원 데이터 구조</option>
            <option value="조건문">조건문</option>
            <option value="반복문">반복문</option>
            <option value="함수">함수</option>
          </select>
          <button id="w-start" class="primary-btn">입장하기 ✨</button>
        </div>
      </section>
    </div>
  `;

  const btn = document.getElementById("w-start");
  btn.addEventListener("click", () => {
    const studentId = document.getElementById("w-student-id").value.trim();
    const studentName = document.getElementById("w-student-name").value.trim();
    const unit = document.getElementById("w-unit-select").value;

    if (!studentId) {
      alert("학번을 입력해 주세요.");
      return;
    }
    if (!/^\d+$/.test(studentId)) {
      alert("학번은 숫자(정수)만 입력할 수 있습니다.");
      return;
    }
    if (!studentName) {
      alert("이름을 반드시 입력해 주세요.");
      return;
    }
    if (!unit) {
      alert("단원을 선택해 주세요.");
      return;
    }

    const s = { studentId, studentName, unit };
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
            <div class="header-actions">
              <button id="open-reflection" class="finish-button-small" title="오늘 코딩을 정리하고 최종본을 제출해요">오·코·완 ✨</button>
              <button id="reset-student" class="secondary-button" title="로그아웃 (기록 지우기)">로그아웃</button>
            </div>
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
            <div style="margin-top: 10px; display: flex; gap: 8px; align-items: center;">
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
                placeholder="예) 오류가 나는 이유가 무엇인요?" />
              <button id="send-btn" class="send-btn">보내기</button>
            </div>

            
          </div>
        </div>

        <div class="output-panel" style="margin-top: 14px;">
          <div class="panel-title output-title-row">
            <div>
              <h3>📊 실행 결과</h3>
              <span class="panel-hint" id="output-status">
                코드 실행 후 결과가 표시됩니다
              </span>
            </div>
            <div class="output-actions">
              <button id="run-code-btn"
                      class="run-btn"
                      title="Python 코드 실행">
                ▶️ 코드 실행
              </button>
              <button id="clear-output-btn"
                      class="run-btn ghost"
                      title="결과 초기화">
                🗑️ 결과 지우기
              </button>
            </div>
          </div>

          <div id="output-log" class="output-log"></div>
          <div id="input-container" class="input-container" style="display: none; margin-top: 10px;">
            <input id="python-input" class="python-input" placeholder="입력하고 Enter를 누르세요" />
          </div>
        </div>

        <!-- 3줄 성찰 모달 -->
        <div id="reflection-modal" class="reflection-modal hidden">
          <div class="reflection-dialog">
            <h3>💌오늘의 코딩을 마무리해 볼까요?</h3>
            <p class="reflection-subtitle">
              아래 세 가지를 적어 주면, 오늘의 최종본과 함께 저장됩니다.
            </p>

            <div class="reflection-fields">
              <label class="reflection-label">
                1) 오늘 내가 스스로 해결한 부분 :
                <textarea id="reflect-1"
                          class="reflection-textarea"
                          rows="2"
                          placeholder="스스로 고민해서 고친 부분을 적어보세요."></textarea>
              </label>

              <label class="reflection-label">
                2) AI 도움을 받아서 이해가 깊어진 부분 :
                <textarea id="reflect-2"
                          class="reflection-textarea"
                          rows="2"
                          placeholder="AI 설명 덕분에 더 잘 이해하게 된 내용을 적어보세요."></textarea>
              </label>

              <label class="reflection-label">
                3) 다음에 더 개선해보고 싶은 점 :
                <textarea id="reflect-3"
                          class="reflection-textarea"
                          rows="2"
                          placeholder="아쉬웠던 점이나 다음에 도전해보고 싶은 것을 적어보세요."></textarea>
              </label>
            </div>

            <div class="reflection-actions">
              <button id="cancel-reflection" class="secondary-button">나중에 할게요!</button>
              <button id="submit-reflection" class="primary-button">
                최종본 및 성장일지 제출하기 ✅
              </button>
            </div>
          </div>
        </div>
    </div>
  `;

  document.getElementById("reset-student").onclick = () => {
    clearStudent();
    renderWelcome();
  };

  setupEditor(student.unit);
  setupPythonRunner();
  setupChat(student);
  setupReflection(student);  
}

function setupEditor(unit) {
  const host = document.getElementById("cm-host");

  const starter = 
`#${unit || "개념"}을 활용하여 나만의 프로그램을 만들어 봅시다!
print("Hello, Sehwa!")


`;

  // Python 콜론 다음 Enter 시만 자동 들여쓰기 (다른 경우는 기본 Enter만)
  const pythonIndentHandler = keymap.of([
    {
      key: "Enter",
      run: (view) => {
        const { from, to } = view.state.selection.main;
        const line = view.state.doc.lineAt(from);
        const beforeCursor = line.text.slice(0, from - line.from);
        const currentIndent = line.text.match(/^(\s*)/)[1];
        
        // 현재 줄이 콜론으로 끝나는지 확인
        if (beforeCursor.trimEnd().endsWith(":")) {
          // 콜론이 있을 때: 기본 들여쓰기 + 추가 들여쓰기
          const newIndent = currentIndent + "  "; // 2칸 추가
          const tr = view.state.update({
            changes: { from, to, insert: "\n" + newIndent },
            selection: EditorSelection.cursor(from + 1 + newIndent.length),
          });
          view.dispatch(tr);
          return true;
        } else {
          // 콜론이 없을 때: 기본 Enter만 (이전 줄의 들여쓰기 유지)
          const tr = view.state.update({
            changes: { from, to, insert: "\n" + currentIndent },
            selection: EditorSelection.cursor(from + 1 + currentIndent.length),
          });
          view.dispatch(tr);
          return true;
        }
      },
    },
  ]);

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
      pythonIndentHandler,
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

// 프로그래밍 무관 질문인지 판단하는 함수
function isProgrammingUnrelatedQuestion(text) {
  const lowerText = text.toLowerCase();

  // 1) 프로그래밍 확장/응용 관련 표현이면 "관련 질문"으로 본다.
  const metaPatterns = [
    "확장", "응용", "발전", "심화",
    "더 어떻게", "더 해볼 수", "더 해 보고 싶",
    "여기서 더", "이거를 더", "이 코드를", "이 프로그램을",
    "다른 방법", "다른 방식", "더 좋은 방법"
  ];
  if (metaPatterns.some(p => text.includes(p))) {
    return false; // 프로그래밍 관련 질문으로 처리
  }

  // 2) 기존 프로그래밍 키워드 목록
  const programmingKeywords = [
    // 파이썬 기본
    "python", "파이썬", "code", "코드", "error", "오류", "bug", "버그", "def", "class",
    "function", "함수", "variable", "변수", "loop", "반복", "if", "for", "while",
    "print", "input", "list", "리스트", "dict", "딕셔너리", "string", "문자열",
    "int", "float", "bool", "자료형", "syntax", "문법", "indent", "들여쓰기",
    "module", "모듈", "import", "try", "except", "exception", "예외",
    // 프로그래밍 개념
    "algorithm", "알고리즘", "logic", "논리", "debug", "디버그", "trace", "condition",
    "조건", "iteration", "재귀", "scope", "범위",
    "parameter", "argument", "인자", "return", "반환", "method", "메서드",
    // 오류 관련
    "nameerror", "typeerror", "indexerror", "keyerror", "valueerror",
    "indentationerror", "syntaxerror", "traceback",
    // 단원 관련
    "단원", "배운", "개념", "실습", "과제", "프로젝트", "practice", "assignment"
  ];

  const hasProgrammingKeyword = programmingKeywords.some(keyword =>
    lowerText.includes(keyword)
  );
  if (hasProgrammingKeyword) {
    return false; // 프로그래밍 관련
  }

  // 3) 진짜로 수업이랑 상관없는 얘기만 명시적으로 막기
  const nonProgrammingKeywords = [
    "점심", "급식", "밥 뭐", "연애", "사랑", "썸", "남친", "여친",
    "mbti", "타로", "운세", "날씨", "오늘 날씨", "게임 추천", "영화 추천"
  ];
  const hasNonProgrammingKeyword = nonProgrammingKeywords.some(keyword =>
    text.includes(keyword)
  );
  if (hasNonProgrammingKeyword) {
    return true; // 프로그래밍 무관
  }

  // 4) 애매한 경우에는 "관련"으로 보되, 나중에 프롬프트에서 자연스럽게 유도
  return false;
}


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
        "👨‍🚀: 저는 여러분의 성장을 돕는 파이썬 도우미 소다예요😊 \n모르는 부분이 있으면 편하게 질문해주세요!",
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
    
    // 프로그래밍 무관 질문 필터링
    if (isProgrammingUnrelatedQuestion(text)) {
      const lower = text.toLowerCase();
      const thanksPatterns = [
        "감사", "고맙", "감사합니다", "고맙습니다",
        "thx", "thanks", "thank", "ㄱㅅ"
      ];
      const isThanks = thanksPatterns.some(p => lower.includes(p));

      if (isThanks) {
        const ack = "도움이 되었다니 다행이에요! 필요하면 언제든 코드나 오류를 질문해 주세요 :)";
        messages.push({ role: "assistant", content: ack });
        renderMessages(log, messages);
        saveChatHistory(student.studentId, messages);
        btn.disabled = false;
        return;
      }

      // 여기서부터 프로그래밍 무관 질문 필터링
      if (isProgrammingUnrelatedQuestion(text)) {
        const rolesMessage = "파이썬 관련 질문을 해 주세요! 다른 내용은 도와드릴 수 없어요 :(";
        messages.push({ role: "assistant", content: rolesMessage });
        renderMessages(log, messages);
        saveChatHistory(student.studentId, messages);
        btn.disabled = false;
        return;
      }
    }

    // 로딩 메시지 표시
    messages.push({ role: "assistant", content: "AI 맞춤 피드백 작성 중... ", isLoading: true });
    renderMessages(log, messages);

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
      "- 답변 전체 길이는 3문장으로 제한해주세요.",
      "- 오류 이유나 수정 방향, 또는 생각해 볼 만한 아이디어를 1~3문장으로 제시해주세요.",
      "- 학생이 명시적으로 '코드로 예시 보여줘'라고 요청하지 않는 한, 실제 파이썬 코드 줄을 쓰지 말고 자연어로 설명해주세요.",
      "- 코드 예시를 꼭 보여줘야 할 때는 한 줄짜리 패턴(예: 'for i in range(횟수): ...') 형태로만 제시해주세요.",
      "- 필요시, 학생이 스스로 확장해 볼 수 있는 간단한 제안이나 질문을 1문장 정도로 덧붙여주세요."

    ].join("\n");

    // 불러오기/저장: API 히스토리는 별도 키로 관리
    let apiHistory = loadChatHistoryForAPI(student.studentId) || [];
    apiHistory.push({ role: "user", content: userContentForAPI });
    apiHistory = truncateChatHistory(apiHistory, 12);

    try {
      const answer = await requestAiHintOnly({ apiHistory });
      
      // 로딩 메시지 제거
      messages.pop();

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
      // 로딩 메시지 제거
      messages.pop();
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
    if (m.role === "user") {
      // 사용자 메시지는 그대로 한 말풍선으로 표시
      const div = document.createElement("div");
      div.className = `msg ${m.role === "user" ? "user" : "assistant"}`;
      div.textContent = m.content;
      if (m.isLoading) {
        div.classList.add("loading");
      }
      container.appendChild(div);
    } else {
      // 어시스턴트 메시지는 문장별로 분리
      if (m.isLoading) {
        const div = document.createElement("div");
        div.className = "msg assistant loading";
        div.textContent = m.content;
        container.appendChild(div);
      } else {
        // 마침표, 느낌표, 물음표로 문장을 분리
        const sentences = m.content.split(/(?<=[.!?])\s+/).filter(s => s.trim());
        for (const sentence of sentences) {
          const div = document.createElement("div");
          div.className = "msg assistant";
          div.textContent = sentence;
          container.appendChild(div);
        }
      }
    }
  }
  container.scrollTop = container.scrollHeight;
}

function setupReflection(student) {
  const btnOpen = document.getElementById("open-reflection");
  const modal = document.getElementById("reflection-modal");
  const btnCancel = document.getElementById("cancel-reflection");
  const btnSubmit = document.getElementById("submit-reflection");

  if (!btnOpen || !modal) return;

  btnOpen.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });

  btnCancel.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  btnSubmit.addEventListener("click", async () => {
    const r1 = (document.getElementById("reflect-1").value || "").trim();
    const r2 = (document.getElementById("reflect-2").value || "").trim();
    const r3 = (document.getElementById("reflect-3").value || "").trim();

    const reflectionAll = [
      `1) 오늘 내가 스스로 해결한 부분 : ${r1}`,
      `2) AI 도움을 받아서 이해가 깊어진 부분 : ${r2}`,
      `3) 다음에 더 개선해보고 싶은 점 : ${r3}`,
    ].join("\n");

    const codeSnapshot = editorView ? editorView.state.doc.toString() : "";
    const unit = getSelectedUnit();

    btnSubmit.disabled = true;
    btnSubmit.textContent = "제출 중...";

    try {
      await logFinalReflectionToGoogleForm({
        studentId: student.studentId,
        studentName: student.studentName,
        unit,
        code: codeSnapshot,
        reflection: reflectionAll,
      });

      modal.classList.add("hidden");
      alert("오늘 코딩 최종본과 성찰이 저장되었습니다. 수고했어요! 😊");
    } catch (e) {
      console.error(e);
      alert("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "최종본 제출하고 마무리하기 ✅";
    }
  });
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
      "※ 현재 소다와의 통신이 끊겼어요🥲 대신 도움이 될 만한 힌트를 줄게요!",
      "",
      "힌트 1) 에러 메시지에 나온 줄 번호를 먼저 확인해 보세요.",
      "힌트 2) if/for/while 아래 들여쓰기가 정확한지 점검해 보세요.",
    ].join("\n");
  }

  const system = [
    "당신은 20년 경력의 고등학교 정보 교사이자 파이썬 문법 전문가입니다.",
    "목표는 학생이 AI에 의존해 코드를 작성하는을 방지하고,",
    "스스로 사고하며 디버깅·설계·개선을 할 수 있도록 스캐폴딩(힌트)을 제공하는 것입니다.",

    "",
    "언어/형식 규칙:",
    "응답은 한국어로만 작성하십시오.",
    "마크다운 문법(제목, 목록 기호, 코드블록 등)을 사용하지 마십시오.",
    "답변 전체 길이는 3~5문장 내로 간결하게 작성하십시오.",
    "문장을 여러 줄로 나누지 마십시오. 학생 화면에서는 줄바꿈마다 말풍선이 하나씩 생기므로, 하나의 답변을 1개의 말풍선에 담는다고 생각하세요.",
    "친절하지만 단호한 교사 톤을 유지하고, 고등학생도 이해하기 쉬운 말을 사용하십시오.",

    "",
    "응답 구성 기준:",
     "응답 구성:",
    "1) 첫 문장에서는 질문을 짧게 받아주거나, 바로 핵심 설명을 시작하십시오.",
    "2) 이어지는 1~2문장으로 오류 이유나 수정 방향, 또는 생각해 볼 만한 아이디어를 간단히 설명하십시오.",
    "3) 마지막 1문장에는 학생이 스스로 시도해 볼 수 있는 제안이나 방향을 넣되, 상황에 따라 생략해도됩니다.",

    "",  
    "코드 예시 제시 규칙:",
    "여러 줄로 된 완성 코드 예시는 절대 제공하지 마십시오.",
    "예시가 필요하면 한 줄짜리 코드 조각만 보여주거나,",
    "코드 예시가 꼭 필요하다면 한 줄짜리 패턴(예: 'for i in range(횟수): ...') 정도만 제시하십시오.",
    "예시를 줄 때도, 나머지 부분은 학생이 채워 넣을 수 있도록 '...'으로 생략하거나 말로만 안내하십시오.",

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
    "단원별 문법 사용 제한:",
    "현재 단원 이름을 보고, 아직 배우지 않은 문법은 예시 코드에 사용하지 마십시오.",
    "예:",
    " - '반복문' 단원일 때는 함수(def, return 등)를 예시 코드에 쓰지 않습니다.",
    " - '조건문' 단원일 때는 반복문(for, while)과 함수는 예시 코드에 쓰지 않습니다.",

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
// ------------------ Google Form Logging ------------------

// 질문 시 기록 (코드 + 프롬프트 + AI답변)
async function logToGoogleForm({
  studentId,
  studentName,
  code,
  prompt,
  aiAnswer,
  unit,
}) {
  const fd = new FormData();

  // 필수 항목
  fd.append(ENTRY_STUDENT_ID, studentId || "");
  fd.append(ENTRY_STUDENT_NAME, studentName || "");
  fd.append(ENTRY_CODE, code || "");
  fd.append(ENTRY_PROMPT, prompt || "");

  // 선택 항목 (정의되어 있을 때만)
  if (ENTRY_UNIT) {
    fd.append(ENTRY_UNIT, unit || "");
  }
  if (ENTRY_AI_ANSWER) {
    fd.append(ENTRY_AI_ANSWER, aiAnswer || "");
  }

  try {
    console.log("[logToGoogleForm] send", {
      studentId,
      studentName,
      unit,
      hasCode: !!code,
      hasPrompt: !!prompt,
      hasAiAnswer: !!aiAnswer,
    });

    // FormData -> 평탄한 객체로 변환하여 DOM 폼으로 제출
    const flat = {};
    for (const pair of fd.entries()) flat[pair[0]] = pair[1];
    await submitFormPost(GOOGLE_FORM_ACTION_URL, flat);
    console.log("[logToGoogleForm] done (submitted via form)");
  } catch (err) {
    console.error("[logToGoogleForm] 실패", err);
  }
}

// 3줄 성찰 최종 제출
async function logFinalReflectionToGoogleForm({
  studentId,
  studentName,
  unit,
  code,
  reflection,
}) {
  const fd = new FormData();

  fd.append(ENTRY_STUDENT_ID, studentId || "");
  fd.append(ENTRY_STUDENT_NAME, studentName || "");
  fd.append(ENTRY_CODE, code || "");
  if (ENTRY_UNIT) {
    fd.append(ENTRY_UNIT, unit || "");
  }
  if (ENTRY_REFLECTION) {
    fd.append(ENTRY_REFLECTION, reflection || "");
  }

  try {
    console.log("[logFinalReflectionToGoogleForm] send", {
      studentId,
      studentName,
      unit,
      hasReflection: !!reflection,
    });

    // FormData -> 평탄화 후 DOM 폼으로 제출
    const flat = {};
    for (const pair of fd.entries()) flat[pair[0]] = pair[1];
    await submitFormPost(GOOGLE_FORM_ACTION_URL, flat);
    console.log("[logFinalReflectionToGoogleForm] done (submitted via form)");
  } catch (err) {
    console.error("[logFinalReflectionToGoogleForm] 실패", err);
    throw err;
  }
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
  const currentStudent = loadStudent();
  
  // 현재 학생의 모든 기록 삭제
  localStorage.removeItem("sehwa_ai_lab_student");
  if (currentStudent && currentStudent.studentId) {
    localStorage.removeItem(`sehwa_ai_lab_ui_${currentStudent.studentId}`);
    localStorage.removeItem(`sehwa_ai_lab_api_${currentStudent.studentId}`);
  }
}
