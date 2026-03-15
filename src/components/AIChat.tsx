import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Settings, X, Loader2, Sparkles, AlertCircle, Paperclip, FileText, Image as ImageIcon, Trash2, Globe } from 'lucide-react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Attachment {
  file: File;
  type: 'image' | 'excel' | 'pdf' | 'word' | 'other';
  content?: string; // For text-based files
  base64?: string; // For images
}

export const AIChat = ({ onClose }: { onClose: () => void }) => {
  const { 
    aiApiKey, setAiApiKey, 
    aiBaseUrl, setAiBaseUrl,
    aiModel, setAiModel,
    aiMessages, addAiMessage, clearAiMessages,
    groups, setGroups,
    teachers, setTeachers,
    students, setStudents,
    courses, setStep, step,
    totalLabs, setTotalLabs,
    resetSystem
  } = useStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(!aiApiKey);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages]);

  const processFile = async (file: File): Promise<Attachment> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'webp'].includes(extension || '')) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      return { file, type: 'image', base64 };
    }

    if (['xlsx', 'xls', 'csv'].includes(extension || '')) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      let content = '';
      workbook.SheetNames.forEach(name => {
        content += `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}\n\n`;
      });
      // Truncate large content to prevent token explosion
      if (content.length > 3000) {
        content = content.slice(0, 3000) + '\n...[内容已截断]';
      }
      return { file, type: 'excel', content };
    }

    if (extension === 'pdf') {
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      let content = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        content += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        if (content.length > 3000) break;
      }
      if (content.length > 3000) {
        content = content.slice(0, 3000) + '\n...[内容已截断]';
      }
      return { file, type: 'pdf', content };
    }

    if (['doc', 'docx'].includes(extension || '')) {
      const data = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: data });
      let content = result.value;
      if (content.length > 3000) {
        content = content.slice(0, 3000) + '\n...[内容已截断]';
      }
      return { file, type: 'word', content };
    }

    return { file, type: 'other' };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = await Promise.all(files.map(processFile));
    setAttachments([...attachments, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const [isTesting, setIsTesting] = useState(false);

  const testAI = async () => {
    if (!aiApiKey) {
      addAiMessage({ role: 'assistant', content: '❌ 请先输入 API Key' });
      return;
    }
    setIsTesting(true);
    try {
      const response = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiApiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        addAiMessage({ role: 'assistant', content: '✅ AI 接口测试成功！模型已就绪。' });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }
    } catch (error: any) {
      addAiMessage({ role: 'assistant', content: `❌ 测试失败: ${error.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSend = async () => {
    const apiKey = aiApiKey;
    if (!input.trim() && attachments.length === 0) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMessageContent = input + (attachments.length > 0 ? `\n\n[附件: ${attachments.map(a => a.file.name).join(', ')}]` : '');
    const userMessage = { role: 'user' as const, content: userMessageContent };
    addAiMessage(userMessage);
    
    const currentInput = input;
    const currentAttachments = [...attachments];
    
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    try {
      const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
      const classNames = Array.from(new Set(students.map(s => s.className)));
      const systemInstruction = `你是一个实验室排课系统的智能助手。
当前系统状态：
- 步骤: ${step}
- 学生总数: ${students.length}人
- 班级列表: ${classNames.join(', ')}
- 教师名单: ${teachers.length > 0 ? teachers.map(t => t.name).join(', ') : '暂无'}
- 实验室总数: ${totalLabs}
- 合班组数: ${groups.length}
- 课程列表: ${courses.join(', ')}
- 当前排课详情:
${groups.length > 0 ? groups.map(g => `[ID: ${g.id}] 课程: ${g.courseName} | 时间: ${g.time.startWeek}-${g.time.endWeek}周 ${WEEKDAYS[g.time.weekday-1]} ${g.time.session} ${g.time.period} | 班级: ${g.classNames.join(', ')} | 实验室数: ${g.splitConfig.numLabs} | 详情: (${g.assignments.map(a => `${a.labName}(${a.studentRange.count}人): ${a.teacherName || '未分配'}`).join(', ')})`).join('\n') : '暂无排课数据'}

你可以通过返回特定格式的 JSON 来调用函数修改系统设置。
你可以执行的操作（请在回复中包含 JSON 代码块）：

--- 学生管理 ---
1. { "action": "add_student", "id": "...", "name": "...", "className": "...", "gender": "...", "major": "..." } - 添加单个学生
2. { "action": "remove_student", "id": "..." } - 按学号删除学生
3. { "action": "update_student", "id": "...", "name": "...", "className": "..." } - 修改学生信息

--- 教师管理 ---
4. { "action": "add_teacher", "teacherName": "..." } - 添加单个教师
5. { "action": "remove_teacher", "teacherName": "..." } - 删除指定教师
6. { "action": "batch_teachers", "teacherNames": ["...", "..."] } - 批量添加教师

--- 课程与合班管理 ---
7. { "action": "add_course", "courseName": "...", "classNames": ["班级1", "班级2"] } - 新增课程并关联班级
8. { "action": "remove_course", "courseName": "..." } - 删除指定课程
9. { "action": "update_course_classes", "courseName": "...", "classNames": ["班级1", "班级2"] } - 更新课程关联班级
10. { "action": "rename_course", "oldName": "...", "newName": "..." } - 重命名课程

--- 上课时间管理 ---
11. { "action": "update_time", "courseName": "...", "weekday": 1, "session": "上午", "period": "1-4节", "startWeek": 1, "endWeek": 16 } - 修改上课时间 (weekday: 1=周一 ~ 7=周日)

--- 实验室拆分与座位 ---
12. { "action": "update_split", "courseName": "...", "numLabs": 2, "baseCapacity": 30 } - 修改实验室数量和基准人数
13. { "action": "update_seating", "courseName": "...", "columns": 4, "rows": 8 } - 修改座位布局

--- 教师分配 ---
14. { "action": "update_teacher", "courseName": "...", "labName": "实验室1", "teacherName": "..." } - 为指定实验室分配教师 (labName 格式: 实验室1, 实验室2...)
15. { "action": "set_course_teachers", "courseName": "...", "teacherName": "..." } - 为某课程所有实验室统一设置教师
16. { "action": "auto_assign_teachers", "courseName": "..." } - 自动轮流分配教师库中的教师

--- 系统控制 ---
17. { "action": "jump_to_step", "step": 1-6 } - 跳转到特定步骤
18. { "action": "update_total_labs", "count": 12 } - 更新实验室总数
19. { "action": "reset_system" } - 重置整个系统 (执行前必须在回复中提示用户确认)

AI 行为规范：
- 可以在一次回复中返回多个 JSON 块来执行多个操作。
- 执行完成后必须明确告知用户实际修改了哪些数据。
- 如果用户指令涉及不存在的课程、教师或班级，应先列出当前存在的选项供用户确认。
- reset_system 操作必须在用户明确二次确认后才能执行。
**重要：请务必将所有 JSON 动作放在 \`\`\`json 和 \`\`\` 代码块中。**

回复格式要求：
- 回复要简洁直接，不要用表格展示系统状态
- 不要在每次回复开头问候用户或重复展示当前状态
- 执行操作后只需简短说明做了什么，例如"已将张老师分配到实验室1"
- 如果用户没有明确要求，不要主动列出所有可用功能
- 不要在回复末尾加"请问你接下来想做什么"之类的引导语
- 语气简洁专业，像一个执行指令的工具，而不是一个客服助手`;

      const messages = [
        { role: 'system', content: systemInstruction },
        ...aiMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: currentInput + currentAttachments.map(a => a.content ? `\n\n文件内容 (${a.file.name}):\n${a.content}` : '').join('') }
      ];

      const response = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.statusText}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices[0].message.content
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
      
      // Process potential JSON actions in the response
      // Priority: Extract from ```json ... ``` blocks
      const codeBlockMatch = assistantMessage.match(/```json\s*([\s\S]*?)\s*```/g);
      const jsonMatch = assistantMessage.match(/\{[\s\S]*?\}/g);
      let executedActions = false;

      const processAction = (jsonStr: string) => {
        try {
          const action = JSON.parse(jsonStr);
          if (action.action === 'update_teacher') {
            const newGroups = groups.map(g => {
              if (g.id === action.groupId || g.courseName === action.courseName) {
                const newAssignments = g.assignments.map(a => {
                  if (a.labName === action.labName) return { ...a, teacherName: action.teacherName };
                  return a;
                });
                return { ...g, assignments: newAssignments };
              }
              return g;
            });
            setGroups(newGroups);
            executedActions = true;
          } else if (action.action === 'set_course_teachers') {
            const newGroups = groups.map(g => {
              if (g.id === action.groupId || g.courseName === action.courseName) {
                const newAssignments = g.assignments.map(a => ({ ...a, teacherName: action.teacherName }));
                return { ...g, assignments: newAssignments };
              }
              return g;
            });
            setGroups(newGroups);
            executedActions = true;
          } else if (action.action === 'auto_assign_teachers') {
            const newGroups = groups.map(g => {
              if (g.courseName === action.courseName) {
                let teacherIdx = 0;
                const newAssignments = g.assignments.map(a => {
                  if (a.teacherName) return a;
                  const teacher = teachers[teacherIdx % teachers.length];
                  teacherIdx++;
                  return { ...a, teacherName: teacher?.name || '' };
                });
                return { ...g, assignments: newAssignments };
              }
              return g;
            });
            setGroups(newGroups);
            executedActions = true;
          } else if (action.action === 'update_split') {
            const newGroups = groups.map(g => {
              if (g.id === action.groupId || g.courseName === action.courseName) {
                return {
                  ...g,
                  splitConfig: {
                    ...g.splitConfig,
                    ...(action.numLabs !== undefined && { numLabs: action.numLabs }),
                    ...(action.baseCapacity !== undefined && { baseCapacity: action.baseCapacity }),
                  }
                };
              }
              return g;
            });
            setGroups(newGroups);
            executedActions = true;
          } else if (action.action === 'update_seating') {
            const newGroups = groups.map(g => {
              if (g.courseName === action.courseName) {
                return {
                  ...g,
                  splitConfig: {
                    ...g.splitConfig,
                    ...(action.columns !== undefined && { columns: action.columns }),
                    ...(action.rows !== undefined && { rows: action.rows }),
                  }
                };
              }
              return g;
            });
            setGroups(newGroups);
            executedActions = true;
          } else if (action.action === 'update_time') {
            const newGroups = groups.map(g => {
              if (g.courseName === action.courseName) {
                return {
                  ...g,
                  time: {
                    ...g.time,
                    ...(action.weekday !== undefined && { weekday: action.weekday }),
                    ...(action.session !== undefined && { session: action.session as any }),
                    ...(action.period !== undefined && { period: action.period }),
                    ...(action.startWeek !== undefined && { startWeek: action.startWeek }),
                    ...(action.endWeek !== undefined && { endWeek: action.endWeek }),
                  }
                };
              }
              return g;
            });
            setGroups(newGroups);
            executedActions = true;
          } else if (action.action === 'add_student') {
            setStudents([...students, {
              id: action.id,
              name: action.name,
              className: action.className,
              gender: action.gender || '未知',
              major: action.major || '未知'
            }]);
            executedActions = true;
          } else if (action.action === 'remove_student') {
            setStudents(students.filter(s => s.id !== action.id));
            executedActions = true;
          } else if (action.action === 'update_student') {
            setStudents(students.map(s => s.id === action.id ? { ...s, ...action } : s));
            executedActions = true;
          } else if (action.action === 'add_teacher') {
            if (!teachers.some(t => t.name === action.teacherName)) {
              setTeachers([...teachers, { name: action.teacherName }]);
              executedActions = true;
            }
          } else if (action.action === 'remove_teacher') {
            setTeachers(teachers.filter(t => t.name !== action.teacherName));
            executedActions = true;
          } else if (action.action === 'batch_teachers') {
            const existingNames = new Set(teachers.map(t => t.name));
            const newTeachers = action.teacherNames
              .filter((name: string) => !existingNames.has(name))
              .map((name: string) => ({ name }));
            setTeachers([...teachers, ...newTeachers]);
            executedActions = true;
          } else if (action.action === 'add_course') {
            const newGroup = {
              id: Math.random().toString(36).substring(2, 15),
              courseName: action.courseName,
              classNames: action.classNames || [],
              totalStudents: 0,
              students: [],
              invalidClasses: [],
              splitConfig: { numLabs: 1, baseCapacity: 32, columns: 4, rows: 8 },
              time: { startWeek: 1, endWeek: 16, weekday: 1, session: '上午' as const, period: '1-4节' },
              assignments: []
            };
            setGroups([...groups, newGroup]);
            executedActions = true;
          } else if (action.action === 'remove_course') {
            setGroups(groups.filter(g => g.courseName !== action.courseName));
            executedActions = true;
          } else if (action.action === 'update_course_classes') {
            setGroups(groups.map(g => g.courseName === action.courseName ? { ...g, classNames: action.classNames } : g));
            executedActions = true;
          } else if (action.action === 'rename_course') {
            setGroups(groups.map(g => g.courseName === action.oldName ? { ...g, courseName: action.newName } : g));
            executedActions = true;
          } else if (action.action === 'jump_to_step') {
            setStep(action.step);
            executedActions = true;
          } else if (action.action === 'update_total_labs') {
            setTotalLabs(action.count);
            executedActions = true;
          } else if (action.action === 'reset_system') {
            resetSystem();
            executedActions = true;
          }
        } catch (e) {
          // Not a valid action JSON, ignore
        }
      };

      if (codeBlockMatch) {
        for (const block of codeBlockMatch) {
          const jsonStr = block.replace(/```json\s*|\s*```/g, '').trim();
          processAction(jsonStr);
        }
      } else if (jsonMatch) {
        for (const jsonStr of jsonMatch) {
          processAction(jsonStr);
        }
      }

      addAiMessage({ role: 'assistant', content: assistantMessage });
      if (executedActions) {
        addAiMessage({ role: 'assistant', content: '✅ 已根据指令更新系统设置。' });
      }
    } catch (error: any) {
      addAiMessage({ role: 'assistant', content: `错误: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-6 border-b border-black/5 flex justify-between items-center bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/10">
            <Globe size={20} />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">AI 智能助手 <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full ml-2">通用接口</span></h3>
            <p className="text-[10px] text-black/40 uppercase font-bold tracking-widest">支持 OpenAI 兼容格式，可接入各类大模型</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={cn("p-2 rounded-full transition-colors", showSettings ? "bg-black text-white" : "hover:bg-black/5 text-black/40")}
          >
            <Settings size={20} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors text-black/40">
            <X size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-[#F5F5F5] border-b border-black/5"
          >
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-lg flex items-center gap-2">
                <AlertCircle className="text-emerald-500 shrink-0" size={14} />
                <p className="text-[10px] text-emerald-800 leading-none font-medium">
                  提示：本助手采用标准 OpenAI 接口协议，请使用临时 API Key 进行排课，系统不保存任何 API Key。
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 px-1">API Base URL</label>
                  <input 
                    type="text" 
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 bg-white border border-black/5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 px-1">Model Name</label>
                  <input 
                    type="text" 
                    placeholder="gpt-4o"
                    className="w-full px-3 py-2 bg-white border border-black/5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 px-1">API Key</label>
                <input 
                  type="password" 
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-white border border-black/5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2 pt-1">
                <Button 
                  onClick={testAI} 
                  disabled={isTesting}
                  variant="secondary"
                  className="flex-1 py-1.5 text-[10px] flex items-center justify-center gap-2"
                >
                  {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  测试连接
                </Button>
                <Button 
                  onClick={() => setShowSettings(false)} 
                  className="flex-[2] py-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                >
                  保存并应用
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#FAFAFA]">
        {aiMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 px-8">
            <div className="w-20 h-20 bg-emerald-50 rounded-[32px] flex items-center justify-center text-emerald-500">
              <Bot size={40} />
            </div>
            <div className="max-w-xs">
              <p className="font-bold text-lg text-black/80">通用 AI 排课专家</p>
              <p className="text-sm text-black/40 mt-2 leading-relaxed">
                支持多种主流模型接入。您可以上传教师名单、学生名单或课表图片，我会自动为您解析并更新系统数据。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {[
                "“帮我把物理实验的教师都设为杨老师”",
                "“上传这张图片里的教师名单”",
                "“跳转到最后一步预览结果”"
              ].map(tip => (
                <button 
                  key={tip}
                  onClick={() => setInput(tip.replace(/[“”]/g, ''))}
                  className="px-4 py-3 bg-white border border-black/5 rounded-2xl text-xs text-black/60 hover:border-emerald-500 transition-all text-left"
                >
                  {tip}
                </button>
              ))}
            </div>
          </div>
        )}
        {aiMessages.map((msg, i) => (
          <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "")}>
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
              msg.role === 'user' ? "bg-emerald-600 text-white" : "bg-white border border-black/5 text-black/40"
            )}>
              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>
            <div className={cn(
              "max-w-[85%] p-5 rounded-[24px] text-sm leading-relaxed shadow-sm",
              msg.role === 'user' ? "bg-emerald-600 text-white rounded-tr-none" : "bg-white border border-black/5 rounded-tl-none"
            )}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-white border border-black/5 flex items-center justify-center text-black/40 shadow-sm">
              <Loader2 size={20} className="animate-spin" />
            </div>
            <div className="bg-white border border-black/5 p-5 rounded-[24px] rounded-tl-none shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-emerald-500/20 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-emerald-500/20 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-emerald-500/20 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-8 bg-white border-t border-black/5">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-2 mb-4"
            >
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl group relative border border-emerald-100">
                  {att.type === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
                  <span className="text-xs font-medium truncate max-w-[120px]">{att.file.name}</span>
                  <button 
                    onClick={() => removeAttachment(i)}
                    className="text-emerald-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-center gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-14 h-14 bg-[#F5F5F5] text-black/40 rounded-2xl flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
          >
            <Paperclip size={24} />
          </button>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            multiple 
            accept="image/*,.xlsx,.xls,.csv,.pdf,.doc,.docx"
            onChange={handleFileSelect}
          />
          <input 
            type="text" 
            placeholder={aiApiKey ? "输入指令或上传文件..." : "请先配置 API Key"}
            disabled={!aiApiKey || isLoading}
            className="flex-1 px-6 py-4 bg-[#F5F5F5] border-none rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={!aiApiKey || (!input.trim() && attachments.length === 0) || isLoading}
            className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center hover:bg-emerald-700 transition-all disabled:opacity-30 shadow-lg shadow-emerald-600/10"
          >
            <Send size={24} />
          </button>
        </div>
        <div className="mt-4 flex justify-between items-center px-2">
          <button 
            onClick={() => {
              if (window.confirm("确定要清除所有对话历史吗？此操作不可撤销。")) {
                clearAiMessages();
              }
            }} 
            className="text-[10px] font-bold uppercase tracking-widest text-black/20 hover:text-red-500 transition-colors"
          >
            清除对话历史
          </button>
        </div>
      </div>
    </div>
  );
};

const Button = ({ children, onClick, className, variant = 'primary', disabled }: any) => {
  const variants = {
    primary: "bg-black text-white hover:bg-black/80",
    secondary: "bg-[#F5F5F5] text-black hover:bg-[#EAEAEA]",
    danger: "bg-red-50 text-red-600 hover:bg-red-100"
  };
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed", 
        variants[variant as keyof typeof variants], 
        className
      )}
    >
      {children}
    </button>
  );
};

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
