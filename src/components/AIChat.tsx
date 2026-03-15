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
    if (!apiKey) { setShowSettings(true); return; }

    const userMessageContent = input + (attachments.length > 0 ? `\n\n[附件: ${attachments.map(a => a.file.name).join(', ')}]` : '');
    addAiMessage({ role: 'user', content: userMessageContent });

    const currentInput = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    const fetchWithTimeout = async (url: string, options: any, timeout = 30000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (e: any) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('请求超时，请检查网络或更换模型');
        throw e;
      }
    };

    const cleanContent = (text: string) =>
      text
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '')
        .replace(/```json[\s\S]*?```/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const executeAction = (name: string, args: any): string => {
      try {
        if (name === 'update_teacher') {
          setGroups(groups.map(g => g.courseName === args.courseName
            ? { ...g, assignments: g.assignments.map(a => a.labName === args.labName ? { ...a, teacherName: args.teacherName } : a) }
            : g
          ));
          return `已将${args.teacherName}分配到${args.courseName}的${args.labName}`;
        }
        if (name === 'set_course_teachers') {
          setGroups(groups.map(g => g.courseName === args.courseName
            ? { ...g, assignments: g.assignments.map(a => ({ ...a, teacherName: args.teacherName })) }
            : g
          ));
          return `已将${args.courseName}所有实验室教师设为${args.teacherName}`;
        }
        if (name === 'auto_assign_teachers') {
          let idx = 0;
          setGroups(groups.map(g => g.courseName === args.courseName
            ? { ...g, assignments: g.assignments.map(a => {
                if (a.teacherName) return a;
                const t = teachers[idx % teachers.length];
                idx++;
                return { ...a, teacherName: t?.name || '' };
              })}
            : g
          ));
          return `已自动分配${args.courseName}的教师`;
        }
        if (name === 'update_split') {
          setGroups(groups.map(g => g.courseName === args.courseName
            ? { ...g, splitConfig: { ...g.splitConfig,
                ...(args.numLabs !== undefined && { numLabs: args.numLabs }),
                ...(args.baseCapacity !== undefined && { baseCapacity: args.baseCapacity }),
              }}
            : g
          ));
          return `已更新${args.courseName}拆分：${args.numLabs ?? ''}个实验室，每间${args.baseCapacity ?? ''}人`;
        }
        if (name === 'update_seating') {
          setGroups(groups.map(g => g.courseName === args.courseName
            ? { ...g, splitConfig: { ...g.splitConfig,
                ...(args.columns !== undefined && { columns: args.columns }),
                ...(args.rows !== undefined && { rows: args.rows }),
              }}
            : g
          ));
          return `已更新${args.courseName}座位布局`;
        }
        if (name === 'update_time') {
          setGroups(groups.map(g => g.courseName === args.courseName
            ? { ...g, time: { ...g.time,
                ...(args.weekday !== undefined && { weekday: args.weekday }),
                ...(args.session !== undefined && { session: args.session }),
                ...(args.period !== undefined && { period: args.period }),
                ...(args.startWeek !== undefined && { startWeek: args.startWeek }),
                ...(args.endWeek !== undefined && { endWeek: args.endWeek }),
              }}
            : g
          ));
          return `已更新${args.courseName}的上课时间`;
        }
        if (name === 'add_teacher') {
          if (!teachers.some(t => t.name === args.teacherName)) {
            setTeachers([...teachers, { name: args.teacherName }]);
            return `已添加教师${args.teacherName}`;
          }
          return `教师${args.teacherName}已存在`;
        }
        if (name === 'remove_teacher') {
          setTeachers(teachers.filter(t => t.name !== args.teacherName));
          return `已删除教师${args.teacherName}`;
        }
        if (name === 'batch_teachers') {
          const existing = new Set(teachers.map(t => t.name));
          const added = (args.teacherNames as string[]).filter(n => !existing.has(n));
          setTeachers([...teachers, ...added.map(n => ({ name: n }))]);
          return `已批量添加教师：${added.join('、')}`;
        }
        if (name === 'add_course') {
          setGroups([...groups, {
            id: Math.random().toString(36).substring(2, 15),
            courseName: args.courseName,
            classNames: args.classNames || [],
            totalStudents: 0, students: [], invalidClasses: [],
            splitConfig: { numLabs: 1, baseCapacity: 32, columns: 4, rows: 8 },
            time: { startWeek: 1, endWeek: 16, weekday: 1, session: '上午' as const, period: '1-4节' },
            assignments: []
          }]);
          return `已添加课程${args.courseName}`;
        }
        if (name === 'remove_course') {
          setGroups(groups.filter(g => g.courseName !== args.courseName));
          return `已删除课程${args.courseName}`;
        }
        if (name === 'update_course_classes') {
          setGroups(groups.map(g => g.courseName === args.courseName ? { ...g, classNames: args.classNames } : g));
          return `已更新${args.courseName}的班级列表`;
        }
        if (name === 'rename_course') {
          setGroups(groups.map(g => g.courseName === args.oldName ? { ...g, courseName: args.newName } : g));
          return `已将${args.oldName}重命名为${args.newName}`;
        }
        if (name === 'add_student') {
          setStudents([...students, { id: args.id, name: args.name, className: args.className, gender: args.gender || '', major: args.major || '' }]);
          return `已添加学生${args.name}`;
        }
        if (name === 'remove_student') {
          setStudents(students.filter(s => s.id !== args.id));
          return `已删除学号${args.id}的学生`;
        }
        if (name === 'update_student') {
          setStudents(students.map(s => s.id === args.id ? { ...s, ...args } : s));
          return `已更新学生${args.id}的信息`;
        }
        if (name === 'jump_to_step') {
          setStep(args.step);
          return `已跳转到第${args.step}步`;
        }
        if (name === 'update_total_labs') {
          setTotalLabs(args.count);
          return `已更新实验室总数为${args.count}`;
        }
        if (name === 'reset_system') {
          resetSystem();
          return '系统已重置';
        }
        return '未知操作';
      } catch (e: any) {
        return `执行失败: ${e.message}`;
      }
    };

    const tools = [
      { type: "function", function: { name: "update_teacher", description: "为指定课程的指定实验室分配教师", parameters: { type: "object", properties: { courseName: { type: "string" }, labName: { type: "string", description: "格式为实验室1、实验室2" }, teacherName: { type: "string" } }, required: ["courseName", "labName", "teacherName"] } } },
      { type: "function", function: { name: "set_course_teachers", description: "为某课程所有实验室统一设置同一位教师", parameters: { type: "object", properties: { courseName: { type: "string" }, teacherName: { type: "string" } }, required: ["courseName", "teacherName"] } } },
      { type: "function", function: { name: "auto_assign_teachers", description: "从教师库自动轮流分配教师给课程未分配的实验室", parameters: { type: "object", properties: { courseName: { type: "string" } }, required: ["courseName"] } } },
      { type: "function", function: { name: "update_split", description: "修改课程的实验室数量和每间基准人数", parameters: { type: "object", properties: { courseName: { type: "string" }, numLabs: { type: "number" }, baseCapacity: { type: "number" } }, required: ["courseName"] } } },
      { type: "function", function: { name: "update_time", description: "修改课程上课时间", parameters: { type: "object", properties: { courseName: { type: "string" }, weekday: { type: "number", description: "1=周一~7=周日" }, session: { type: "string", description: "上午或下午" }, period: { type: "string", description: "如1-4节、6-8节" }, startWeek: { type: "number" }, endWeek: { type: "number" } }, required: ["courseName"] } } },
      { type: "function", function: { name: "update_seating", description: "修改座位布局", parameters: { type: "object", properties: { courseName: { type: "string" }, columns: { type: "number" }, rows: { type: "number" } }, required: ["courseName"] } } },
      { type: "function", function: { name: "add_teacher", description: "添加单个教师", parameters: { type: "object", properties: { teacherName: { type: "string" } }, required: ["teacherName"] } } },
      { type: "function", function: { name: "remove_teacher", description: "删除指定教师", parameters: { type: "object", properties: { teacherName: { type: "string" } }, required: ["teacherName"] } } },
      { type: "function", function: { name: "batch_teachers", description: "批量添加多位教师", parameters: { type: "object", properties: { teacherNames: { type: "array", items: { type: "string" } } }, required: ["teacherNames"] } } },
      { type: "function", function: { name: "add_course", description: "新增课程并关联班级", parameters: { type: "object", properties: { courseName: { type: "string" }, classNames: { type: "array", items: { type: "string" } } }, required: ["courseName"] } } },
      { type: "function", function: { name: "remove_course", description: "删除指定课程", parameters: { type: "object", properties: { courseName: { type: "string" } }, required: ["courseName"] } } },
      { type: "function", function: { name: "update_course_classes", description: "更新课程关联班级列表", parameters: { type: "object", properties: { courseName: { type: "string" }, classNames: { type: "array", items: { type: "string" } } }, required: ["courseName", "classNames"] } } },
      { type: "function", function: { name: "rename_course", description: "重命名课程", parameters: { type: "object", properties: { oldName: { type: "string" }, newName: { type: "string" } }, required: ["oldName", "newName"] } } },
      { type: "function", function: { name: "add_student", description: "添加单个学生", parameters: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, className: { type: "string" }, gender: { type: "string" }, major: { type: "string" } }, required: ["id", "name", "className"] } } },
      { type: "function", function: { name: "remove_student", description: "按学号删除学生", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
      { type: "function", function: { name: "update_student", description: "按学号修改学生信息", parameters: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, className: { type: "string" } }, required: ["id"] } } },
      { type: "function", function: { name: "jump_to_step", description: "跳转到指定步骤1-6", parameters: { type: "object", properties: { step: { type: "number" } }, required: ["step"] } } },
      { type: "function", function: { name: "update_total_labs", description: "更新系统实验室总数", parameters: { type: "object", properties: { count: { type: "number" } }, required: ["count"] } } },
      { type: "function", function: { name: "reset_system", description: "重置整个系统，需用户二次确认后才能调用", parameters: { type: "object", properties: {} } } },
    ];

    try {
      const WEEKDAYS = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
      const classNames = Array.from(new Set(students.map(s => s.className)));
      const systemInstruction = `你是实验室排课系统的智能助手。
当前状态：步骤${step} | 学生${students.length}人 | 班级：${classNames.join('、') || '无'} | 教师：${teachers.map(t => t.name).join('、') || '无'} | 实验室总数：${totalLabs} | 课程：${groups.map(g => `${g.courseName}(实验室数:${g.splitConfig.numLabs},教师:${g.assignments.map(a => a.teacherName || '未分配').join('/')})`).join('；') || '无'}

全流程引导：根据当前状态判断下一步，按顺序引导完成：
1.学生为0→提示上传名单或手动添加
2.教师为空→询问有哪些带教教师
3.课程为0→询问需要排哪些课程和班级
4.有课程时间未设置→逐一确认上课时间
5.有课程教师未分配→询问实验室数量和各实验室教师
6.全部完成→告知完成并跳转第6步

规范：每次只问一个问题；用户回答后立即调用对应工具执行；用户主动发指令则优先执行；回复不超过2句话，简洁专业。`;

      const messages: any[] = [
        { role: 'system', content: systemInstruction },
        ...aiMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: currentInput + currentAttachments.map(a => a.content ? `\n\n文件内容(${a.file.name}):\n${a.content}` : '').join('') }
      ];

      let loopMessages = [...messages];
      let maxRounds = 3;
      let round = 0;

      while (round < maxRounds) {
        const res = await fetchWithTimeout(`${aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: aiModel,
            messages: loopMessages,
            tools,
            tool_choice: "auto",
            temperature: 0.7
          })
        });
        if (!res.ok) throw new Error(`API错误: ${res.status} ${await res.text()}`);
        const data = await res.json();
        const msg = data.choices[0].message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          loopMessages.push(msg);
          for (const tc of msg.tool_calls) {
            const args = JSON.parse(tc.function.arguments);
            const result = executeAction(tc.function.name, args);
            loopMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
          }
          round++;
        } else {
          addAiMessage({ role: 'assistant', content: cleanContent(msg.content || '') });
          break;
        }

        if (round >= maxRounds) {
          addAiMessage({ role: 'assistant', content: '已执行多步操作，请确认结果是否符合预期。' });
          break;
        }
      }

    } catch (error: any) {
      addAiMessage({ role: 'assistant', content: cleanContent(`错误: ${error.message}`) });
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
