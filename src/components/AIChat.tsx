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
    courses, setStep,
    totalLabs, setTotalLabs
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
      }
      return { file, type: 'pdf', content };
    }

    if (['doc', 'docx'].includes(extension || '')) {
      const data = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: data });
      return { file, type: 'word', content: result.value };
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
      const systemInstruction = `你是一个实验室排课系统的智能助手。
当前系统状态：
- 步骤: ${useStore.getState().step}
- 学生总数: ${students.length}
- 教师总数: ${teachers.length}
- 实验室总数: ${totalLabs}
- 合班组数: ${groups.length}
- 课程列表: ${courses.join(', ')}
- 当前排课详情:
${groups.map(g => `  * 课程: ${g.courseName}, 班级: ${g.classNames.join('+')}, 实验室数: ${g.splitConfig.numLabs}, 教师: ${g.assignments.map(a => `${a.labName}(${a.teacherName || '未分配'})`).join(', ')}`).join('\n')}

你可以通过返回特定格式的 JSON 来调用函数修改系统设置。
如果用户上传了文件（Excel, PDF, Word, 图片），请分析文件内容并根据用户要求进行操作。

你可以执行的操作（请在回复中包含 JSON 代码块）：
1. { "action": "update_teacher", "courseName": "...", "labName": "...", "teacherName": "..." } - 更新特定实验室的教师
2. { "action": "set_course_teachers", "courseName": "...", "teacherName": "..." } - 为该课程的所有实验室设置同一位教师
3. { "action": "update_split", "courseName": "...", "numLabs": 2, "baseCapacity": 30 } - 更新课程的拆分设置
4. { "action": "jump_to_step", "step": 1-6 } - 跳转到特定步骤
5. { "action": "batch_teachers", "teacherNames": ["...", "..."] } - 批量添加教师名单
6. { "action": "update_total_labs", "count": 12 } - 更新实验室总数

请根据用户的自然语言指令和上传的文件内容，决定是否需要执行操作。
注意：你可以一次性返回多个 JSON 块来执行多个操作。
如果你修改了数据，请在回复中明确告知用户你做了哪些改动。`;

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
      const assistantMessage = data.choices[0].message.content;
      
      // Process potential JSON actions in the response
      const jsonMatch = assistantMessage.match(/\{[\s\S]*?\}/g);
      let executedActions = false;

      if (jsonMatch) {
        for (const jsonStr of jsonMatch) {
          try {
            const action = JSON.parse(jsonStr);
            if (action.action === 'update_teacher') {
              const newGroups = groups.map(g => {
                if (g.courseName === action.courseName) {
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
                if (g.courseName === action.courseName) {
                  const newAssignments = g.assignments.map(a => ({ ...a, teacherName: action.teacherName }));
                  return { ...g, assignments: newAssignments };
                }
                return g;
              });
              setGroups(newGroups);
              executedActions = true;
            } else if (action.action === 'update_split') {
              const newGroups = groups.map(g => {
                if (g.courseName === action.courseName) {
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
            } else if (action.action === 'jump_to_step') {
              setStep(action.step);
              executedActions = true;
            } else if (action.action === 'batch_teachers') {
              const newTeachers = action.teacherNames.map((name: string) => ({ name }));
              setTeachers(newTeachers);
              executedActions = true;
            } else if (action.action === 'update_total_labs') {
              setTotalLabs(action.count);
              executedActions = true;
            }
          } catch (e) {
            // Not a valid action JSON, ignore
          }
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
            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-start gap-3">
                <AlertCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} />
                <div className="space-y-1">
                  <p className="text-[11px] text-emerald-800 leading-relaxed font-bold">
                    提示：请使用临时 API Key 进行排课，系统不保存任何 API Key。
                  </p>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    本助手采用标准 OpenAI 接口协议，您可以接入 ChatGPT、Claude、DeepSeek 或自建模型。
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 px-1">API Base URL</label>
                  <input 
                    type="text" 
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 px-1">Model Name</label>
                  <input 
                    type="text" 
                    placeholder="gpt-4o"
                    className="w-full px-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 px-1">API Key</label>
                <input 
                  type="password" 
                  placeholder="sk-..."
                  className="w-full px-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                />
              </div>
              <Button onClick={() => setShowSettings(false)} className="w-full py-2 text-xs bg-emerald-600 hover:bg-emerald-700">保存并应用</Button>
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
                "“帮我把物理实验的教师都设为王老师”",
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
        <div className="mt-6 flex justify-between items-center px-2">
          <button onClick={clearAiMessages} className="text-[10px] font-bold uppercase tracking-widest text-black/20 hover:text-red-500 transition-colors">清除对话历史</button>
          <p className="text-[9px] text-black/20 font-medium tracking-wide">AI 助手支持 OpenAI 兼容接口，可理解文档内容并自动执行排课操作</p>
        </div>
      </div>
    </div>
  );
};

const Button = ({ children, onClick, className, variant = 'primary' }: any) => {
  const variants = {
    primary: "bg-black text-white hover:bg-black/80",
    secondary: "bg-[#F5F5F5] text-black hover:bg-[#EAEAEA]",
    danger: "bg-red-50 text-red-600 hover:bg-red-100"
  };
  return (
    <button 
      onClick={onClick} 
      className={cn("px-4 py-2 rounded-xl font-medium transition-all", variants[variant as keyof typeof variants], className)}
    >
      {children}
    </button>
  );
};

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
