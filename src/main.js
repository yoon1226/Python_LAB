import "./style.css";

// ------------------ Google Form 설정 ------------------
// 정윤님 폼 ID 기반 formResponse URL
const GOOGLE_FORM_ACTION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfnSx_oPvYvXZYoax3ymFD8qCAxm-5Azbl7pGM11h18n-k9Yw/formResponse";

// 기존 4개
const ENTRY_STUDENT_ID = "entry.787137631";
const ENTRY_STUDENT_NAME = "entry.1927596191";
const ENTRY_CODE = "entry.1434858983";
const ENTRY_PROMPT = "entry.1432979324";

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

const app = document.getElementById("app");

// Pyodide 초기화
initPyodide();

async function initPyodide() {
  try {
    let pyodide = await loadPyodide();
    window.pyodide = pyodide;
    pyodideReady = true;
  } catch (err) {
    console.error("Pyodide 로드 실패:", err);
    pyodideReady = false;
  }
}

init();

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
          AI는 정답이 아니라, 여러분의 생각을 돕는 <strong>도우미</strong>입니다.
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
            <div class="lab-meta">${student.studentId} ${student.studentName} · 질문할 때마다 성장 기록이 저장됩니다</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge">Hint Only</span>
            <button id="reset-student" class="send-btn" title="학번/이름 다시 입력">정보 변경</button>
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
# 아래에 나만의 프로그램을 만들어 보세요.
# AI에게는 '전체 코드'가 아니라 '힌트'만 요청해보기!

def main():
    print("Hello, Sehwa!")

if __name__ == "__main__":
    main()
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
}

// ------------------ Python Runner ------------------
// ...existing code...

function setupPythonRunner() {
  const runBtn = document.getElementById("run-code-btn");
  const clearBtn = document.getElementById("clear-output-btn");
  const outputLog = document.getElementById("output-log");
  const outputStatus = document.getElementById("output-status");

  runBtn.addEventListener("click", async () => {
    if (!pyodideReady) {
      outputLog.innerHTML = '<div class="output-error">Pyodide가 아직 로드 중입니다. 잠시 후 다시 시도해 주세요.</div>';
      return;
    }

    const code = editorView?.state.doc.toString() ?? "";
    if (!code.trim()) {
      outputLog.innerHTML = '<div class="output-error">코드를 입력해 주세요.</div>';
      return;
    }

    runBtn.disabled = true;
    outputLog.innerHTML = '<div class="output-info">코드 실행 중...</div>';
    outputStatus.textContent = '실행 중...';

    try {
      const pyodide = window.pyodide;
      
      // 사용자 코드를 exec() 형태로 실행하고 표준 출력 캡처
      const result = pyodide.runPython(`
import sys
from io import StringIO

_old_stdout = sys.stdout
sys.stdout = StringIO()

try:
    exec("""${code.replace(/"""/g, '\\"\\"\\"')}""")
    _result = sys.stdout.getvalue()
except Exception as e:
    _result = f"오류 발생:\\n{type(e).__name__}: {e}"
finally:
    sys.stdout = _old_stdout

_result
`);

      const output_text = result.toString();
      
      if (output_text.trim()) {
        outputLog.innerHTML = `<pre class="output-text">${escapeHtml(output_text)}</pre>`;
      } else {
        outputLog.innerHTML = '<div class="output-info">출력 결과가 없습니다.</div>';
      }
      
      outputStatus.textContent = '✓ 실행 완료';
    } catch (err) {
      console.error("Python 실행 오류:", err);
      outputLog.innerHTML = `<pre class="output-error">${escapeHtml(err.toString())}</pre>`;
      outputStatus.textContent = '✗ 오류 발생';
    } finally {
      runBtn.disabled = false;
    }
  });

  clearBtn.addEventListener("click", () => {
    outputLog.innerHTML = '';
    outputStatus.textContent = '코드 실행 후 결과가 표시됩니다';
  });
}

// ...existing code...
import sys
from io import StringIO

# 표준 출력 캡처
_old_stdout = sys.stdout
_captured_lines = []

class OutputCapture:
    def write(self, text):
        _captured_lines.append(text)
    def flush(self):
        pass

sys.stdout = OutputCapture()

try:
    exec("""${code.replace(/"/g, '\\"')}""")
except Exception as e:
    _captured_lines.append(f"Error: {type(e).__name__}: {e}")
finally:
    sys.stdout = _old_stdout

_captured_output = ''.join(_captured_lines)
`;

      // 더 간단한 방식: 직접 코드 실행
      const result = pyodide.runPython(`
import sys
from io import StringIO

_old_stdout = sys.stdout
sys.stdout = StringIO()

try:
    exec("""${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}""")
    _result = sys.stdout.getvalue()
except Exception as e:
    _result = f"Error: {type(e).__name__}: {e}"
finally:
    sys.stdout = _old_stdout

_result
`);

      const output_text = result.toString();
      
      if (output_text.trim()) {
        outputLog.innerHTML = `<div class="output-text">${escapeHtml(output_text)}</div>`;
      } else {
        outputLog.innerHTML = '<div class="output-info">출력 결과가 없습니다.</div>';
      }
      
      outputStatus.textContent = '실행 완료';
    } catch (err) {
      console.error("Python 실행 오류:", err);
      outputLog.innerHTML = `<div class="output-error">${escapeHtml(err.toString())}</div>`;
      outputStatus.textContent = '오류 발생';
    } finally {
      runBtn.disabled = false;
    }
  });

  clearBtn.addEventListener("click", () => {
    outputLog.innerHTML = '';
    outputStatus.textContent = '코드 실행 후 결과가 표시됩니다';
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ------------------ Chat Logic ------------------
function setupChat(student) {
  const log = document.getElementById("chat-log");
  const input = document.getElementById("chat-input");
  const btn = document.getElementById("send-btn");

  const messages = [
    {
      role: "assistant",
      content:
        "안녕하세요! 😊\n저는 '힌트만' 주는 파이썬 도우미예요.\n전체 코드를 대신 작성하지 않고, 어디를 어떻게 고치면 좋을지 방향을 함께 찾아볼게요.",
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

    messages.push({ role: "user", content: text });
    renderMessages(log, messages);

    try {
      const answer = await requestAiHintOnly({
        student,
        code: codeSnapshot,
        prompt: text,
      });

      messages.push({ role: "assistant", content: answer });
      renderMessages(log, messages);

      // ★ 질문 순간 기록 저장 (코드+프롬프트+AI답변)
      await logToGoogleForm({
        studentId: student.studentId,
        studentName: student.studentName,
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

// ------------------ OpenAI Call (Hint-only) ------------------
async function requestAiHintOnly({ student, code, prompt }) {
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
    "당신은 고등학생 수준의 파이썬 코딩 조교입니다.",
    "절대로 전체 정답 코드를 통째로 제공하지 마세요.",
    "학생이 스스로 생각하도록 '힌트, 원인 추정, 수정 방향'만 제시하세요.",
    "최대 1~3줄의 아주 짧은 예시만 허용합니다.",
  ].join(" ");

  const user = [
    `학생: ${student.studentId} ${student.studentName}`,
    "",
    "현재 코드:",
    "```python",
    code || "(코드 없음)",
    "```",
    "",
    "학생 질문:",
    prompt,
    "",
    "요청:",
    "- 전체 코드를 주지 말고",
    "- 왜 문제가 생길 수 있는지",
    "- 어디를 어떻게 점검/수정하면 좋을지",
    "- 다음 시도 과제(체크리스트) 형태로",
    "한국어로 6~10줄 힌트를 제공하세요.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
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
