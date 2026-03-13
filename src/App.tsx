import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  FileSpreadsheet, 
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Users,
  Info,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  Clock,
  UserPlus,
  Search,
  X,
  Settings,
  Split,
  RefreshCw,
  Download,
  BookOpen,
  Save,
  FileUp,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Student, 
  Teacher, 
  CombinedClassGroup, 
  WEEKDAYS, 
  SESSIONS,
  SessionType,
  LabAssignment
} from './types';
import { useStore } from './store';
import { exportFullWorkbook } from './exportService';
import { AIChat } from './components/AIChat';
import { saveAs } from 'file-saver';

// --- Utility Components ---
const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

const StepNavigation = ({ 
  step, 
  onStepClick, 
  nextDisabled = false, 
  className 
}: { 
  step: number, 
  onStepClick: (s: number) => void, 
  nextDisabled?: boolean,
  className?: string
}) => (
  <div className={cn("flex justify-between items-center py-2 border-y border-black/5 my-4", className)}>
    {step > 1 ? (
      <Button variant="secondary" onClick={() => onStepClick(step - 1)} icon={ArrowLeft} className="px-3 py-1.5 text-xs">上一步</Button>
    ) : <div />}
    <div className="text-[10px] font-bold uppercase tracking-widest text-black/20">步骤 {step} / 6</div>
    {step < 6 ? (
      <Button disabled={nextDisabled} onClick={() => onStepClick(step + 1)} icon={ArrowRight} className="px-3 py-1.5 text-xs">下一步</Button>
    ) : <div />}
  </div>
);

const Card = ({ children, className, onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn("bg-white rounded-[32px] border border-black/5 shadow-sm overflow-hidden", className)}
  >
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false, 
  className,
  icon: Icon
}: { 
  children?: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost',
  disabled?: boolean,
  className?: string,
  icon?: any
}) => {
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20",
    secondary: "bg-[#F5F5F5] text-black hover:bg-[#EAEAEA]",
    outline: "border border-black/10 text-black hover:bg-black/5",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "text-black/40 hover:text-emerald-600 hover:bg-emerald-50"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        "px-6 py-3 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const parsePeriod = (p: string) => {
  const m = p.match(/(\d+)-(\d+)节/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

export default function App() {
  const { 
    step, setStep, 
    students, setStudents, 
    teachers, setTeachers, 
    groups, setGroups,
    courses, addCourse,
    addGroup, batchAddGroups, updateGroup, removeGroup,
    totalLabs, setTotalLabs,
    resetSystem, loadState
  } = useStore();

  const [showInfo, setShowInfo] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [batchGroupText, setBatchGroupText] = useState('');
  const [batchTeacherText, setBatchTeacherText] = useState('');
  const [studentSummary, setStudentSummary] = useState<string | null>(null);
  const [teacherSummary, setTeacherSummary] = useState<string | null>(null);
  const [groupSummary, setGroupSummary] = useState<string | null>(null);
  const [unassignedClasses, setUnassignedClasses] = useState<string[]>([]);
  
  // Step 6 Preview State
  const [previewMode, setPreviewMode] = useState<'summary' | 'attendance' | 'seating'>('summary');
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [activeAssignIdx, setActiveAssignIdx] = useState(0);
  const [manualStudent, setManualStudent] = useState({ id: '', name: '', className: '' });
  const [showManualStudent, setShowManualStudent] = useState(false);

  const prevStudentsRef = React.useRef(students);
  useEffect(() => {
    if (prevStudentsRef.current !== students && groups.length > 0) {
      const updatedGroups = groups.map(group => {
        const groupStudents = students.filter(s => group.classNames.includes(s.className)).sort((a, b) => {
          const classCmp = a.className.localeCompare(b.className);
          if (classCmp !== 0) return classCmp;
          return a.id.localeCompare(b.id);
        });
        return {
          ...group,
          totalStudents: groupStudents.length,
          students: groupStudents,
          invalidClasses: group.classNames.filter(cn => !students.some(s => s.className === cn))
        };
      });
      setGroups(updatedGroups);
      prevStudentsRef.current = students;
    }
  }, [students, groups, setGroups]);

  useEffect(() => {
    if (step === 6) {
      setActiveGroupIdx(0);
      setActiveAssignIdx(0);
      setPreviewMode('summary');
    }
  }, [step]);

  // --- Navigation Validation ---
  const handleStepClick = (targetStep: number) => {
    if (targetStep === 1 || targetStep === 2) {
      setStep(targetStep);
      return;
    }
    if (students.length === 0) {
      alert('请先上传学生名单！');
      return;
    }
    if (targetStep === 3 || targetStep === 4) {
      setStep(targetStep);
      return;
    }
    if (groups.length === 0) {
      alert('请先完成合班分组设置！');
      return;
    }
    if (targetStep === 5) {
      const conflicts = checkStudentConflicts();
      if (conflicts.length > 0) {
        alert(`发现学生上课时间冲突，请先调整：\n${conflicts[0]}`);
        return;
      }
      if (labConflicts.length > 0) {
        alert(`发现实验室资源冲突，请先调整：\n${labConflicts[0]}`);
        return;
      }
      proceedToStep5();
      return;
    }
    if (targetStep === 6) {
      if (!isAllTeachersAssigned) {
        alert('请先为所有实验室分配教师！');
        return;
      }
      setStep(6);
    }
  };

  const checkStudentConflicts = useCallback((): string[] => {
    const conflicts: string[] = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const g1 = groups[i];
        const g2 = groups[j];

        const weeksOverlap = Math.max(g1.time.startWeek, g2.time.startWeek) <= Math.min(g1.time.endWeek, g2.time.endWeek);
        const dayOverlap = g1.time.weekday === g2.time.weekday;
        
        if (weeksOverlap && dayOverlap) {
          const [s1, e1] = parsePeriod(g1.time.period);
          const [s2, e2] = parsePeriod(g2.time.period);
          const periodOverlap = Math.max(s1, s2) <= Math.min(e1, e2);

          if (periodOverlap) {
            const ids1 = new Set(g1.students.map(s => s.id));
            const commonStudents = g2.students.filter(s => ids1.has(s.id));
            
            if (commonStudents.length > 0) {
              const studentNames = commonStudents.slice(0, 3).map(s => s.name).join('、');
              const suffix = commonStudents.length > 3 ? `等 ${commonStudents.length} 人` : '';
              conflicts.push(`⚠️ 学生冲突：${studentNames}${suffix} 在 ${WEEKDAYS[g1.time.weekday-1]} ${g1.time.period} 同时被安排了 [${g1.courseName}] 和 [${g2.courseName}]`);
            }
          }
        }
      }
    }
    return conflicts;
  }, [groups]);

  const studentConflicts = useMemo(() => checkStudentConflicts(), [checkStudentConflicts]);

  const labConflicts = useMemo(() => {
    const conflicts: string[] = [];
    // Check for each week, day, and period
    for (let w = 1; w <= 20; w++) { // Assuming max 20 weeks
      for (let d = 1; d <= 7; d++) {
        // Check each session
        ['上午', '下午'].forEach(session => {
          // Check each possible period (1-12)
          for (let p = 1; p <= 12; p++) {
            const overlappingGroups = groups.filter(g => {
              const [start, end] = parsePeriod(g.time.period);
              return g.time.startWeek <= w && g.time.endWeek >= w &&
                     g.time.weekday === d &&
                     g.time.session === session &&
                     start <= p && end >= p;
            });
            
            const totalUsed = overlappingGroups.reduce((sum, g) => sum + g.splitConfig.numLabs, 0);
            if (totalUsed > totalLabs) {
              const timeStr = `第${w}周 ${WEEKDAYS[d-1]} ${session}第${p}节`;
              const courseNames = overlappingGroups.map(g => g.courseName).join('、');
              const conflictMsg = `⚠️ 实验室超限：${timeStr} 实验室总需求为 ${totalUsed} (上限 ${totalLabs})。涉及课程：${courseNames}`;
              if (!conflicts.includes(conflictMsg)) {
                conflicts.push(conflictMsg);
              }
            }
          }
        });
      }
    }
    return conflicts.slice(0, 5); // Limit to 5 messages to avoid UI clutter
  }, [groups, totalLabs]);

  // --- Step 1: Data Ingestion ---
  const handleStudentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];
      const parsed = data.map(row => ({
        id: String(row['学号'] || row['ID'] || ''),
        name: String(row['姓名'] || row['Name'] || ''),
        gender: String(row['性别'] || ''),
        major: String(row['专业名称'] || ''),
        className: String(row['班级名称'] || row['班级'] || ''),
      })).filter(s => s.id && s.name);
      setStudents(parsed);
      const uniqueClasses = new Set(parsed.map(s => s.className)).size;
      setStudentSummary(`✅ 解析成功：共导入 ${parsed.length} 名学生，涉及 ${uniqueClasses} 个班级。`);
    };
    reader.readAsBinaryString(file);
  };

  const handleTeacherUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const firstRow = data[0] || [];
      const startIdx = (String(firstRow[0]).includes('姓名') || String(firstRow[0]).includes('教师')) ? 1 : 0;
      const parsed = data.slice(startIdx).flat().filter(Boolean).map(name => ({ name: String(name) }));
      setTeachers([...teachers, ...parsed]);
      setTeacherSummary(`✅ 解析成功：共导入 ${parsed.length} 名教师。`);
    };
    reader.readAsBinaryString(file);
  };

  const handleGroupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const newGroups = data.slice(1).map((row) => {
        const courseName = String(row[0] || '').trim();
        const classNames = row.slice(1).filter(Boolean).map(c => String(c));
        if (courseName) addCourse(courseName);
        return createGroupObject(courseName, classNames);
      }).filter(g => g.courseName);
      setGroups([...groups, ...newGroups]);
      
      const uniqueCourses = new Set(newGroups.map(g => g.courseName)).size;
      setGroupSummary(`✅ 解析成功：共提取 ${uniqueCourses} 门课程，${newGroups.length} 个合班组。`);
      
      const allGroupClasses = Array.from(new Set(newGroups.flatMap(g => g.classNames)));
      const unassigned = allGroupClasses.filter(cn => !students.some(s => s.className === cn));
      setUnassignedClasses(unassigned);
    };
    reader.readAsBinaryString(file);
  };

  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
  };

  const createGroupObject = (courseName: string, classNames: string[]): CombinedClassGroup => {
    const groupStudents = students.filter(s => classNames.includes(s.className)).sort((a, b) => {
      const classCmp = a.className.localeCompare(b.className);
      if (classCmp !== 0) return classCmp;
      return a.id.localeCompare(b.id);
    });
    const invalidClasses = classNames.filter(cn => !students.some(s => s.className === cn));
    const total = groupStudents.length;
    const defaultCapacity = Math.min(32, total || 32);
    const defaultLabs = Math.max(1, Math.ceil(total / defaultCapacity));
    
    return {
      id: generateId(),
      courseName,
      classNames,
      totalStudents: total,
      students: groupStudents,
      invalidClasses,
      splitConfig: { 
        numLabs: defaultLabs, 
        baseCapacity: defaultCapacity,
        columns: 4,
        rows: 8
      },
      time: { startWeek: 1, endWeek: 16, weekday: 1, session: '上午', period: '1-4节' },
      assignments: []
    };
  };

  const handleBatchAddGroup = () => {
    const names = batchGroupText.split('\n').map(n => n.trim()).filter(Boolean);
    const newGroups = names.map(name => createGroupObject(name, []));
    batchAddGroups(newGroups);
    setBatchGroupText('');
  };

  const handleManualAddGroup = () => {
    const newGroup = createGroupObject('', []);
    addGroup(newGroup);
  };

  const handleBatchTeacher = () => {
    const names = batchTeacherText.split('\n').map(n => n.trim()).filter(Boolean);
    setTeachers([...teachers, ...names.map(name => ({ name }))]);
    setBatchTeacherText('');
  };

  // --- Step 5: Split Logic ---
  const calculateAssignments = useCallback((group: CombinedClassGroup): LabAssignment[] => {
    const assignments: LabAssignment[] = [];
    let currentIdx = 0;
    for (let i = 0; i < group.splitConfig.numLabs; i++) {
      const isLast = i === group.splitConfig.numLabs - 1;
      const count = isLast ? (group.totalStudents - currentIdx) : group.splitConfig.baseCapacity;
      const slice = group.students.slice(currentIdx, currentIdx + count);
      assignments.push({
        labName: `实验室${i + 1}`,
        teacherName: '',
        studentRange: {
          startId: slice[0]?.id || '',
          endId: slice[slice.length - 1]?.id || '',
          count: slice.length,
          studentList: slice
        }
      });
      currentIdx += slice.length;
    }
    return assignments;
  }, []);

  // Keep assignments in sync with splitConfig and students
  useEffect(() => {
    const needsUpdate = groups.some(g => 
      g.assignments.length > 0 && (
        g.assignments.length !== g.splitConfig.numLabs || 
        g.assignments.reduce((sum, a) => sum + a.studentRange.count, 0) !== g.totalStudents
      )
    );

    if (needsUpdate) {
      setGroups(groups.map(g => {
        if (g.assignments.length > 0) {
          const newAssignments = calculateAssignments(g);
          // Try to preserve teacher names if lab names match
          return {
            ...g,
            assignments: newAssignments.map(na => {
              const old = g.assignments.find(oa => oa.labName === na.labName);
              return old ? { ...na, teacherName: old.teacherName } : na;
            })
          };
        }
        return g;
      }));
    }
  }, [groups, setGroups, calculateAssignments]);

  const proceedToStep5 = () => {
    const invalid = groups.some(g => (g.splitConfig.numLabs - 1) * g.splitConfig.baseCapacity >= g.totalStudents && g.splitConfig.numLabs > 1);
    if (invalid) {
      alert('部分课程的拆分设置不合理（前置教室人数已超过总人数），请检查！');
      return;
    }
    if (studentConflicts.length > 0) {
      alert(`发现学生上课时间冲突，请先调整：\n${studentConflicts[0]}`);
      return;
    }
    
    setGroups(groups.map(g => {
      const newAssignments = calculateAssignments(g);
      if (g.assignments && g.assignments.length > 0) {
        newAssignments.forEach((na, idx) => {
          const oldAssign = g.assignments[idx];
          if (oldAssign) {
            na.labName = oldAssign.labName; // 保留用户修改过的实验室名称
            na.teacherName = oldAssign.teacherName; // 保留用户选择的教师
          }
        });
      }
      return { ...g, assignments: newAssignments };
    }));
    setStep(5);
  };

  // --- Step 5: Validation ---
  const isAllTeachersAssigned = useMemo(() => groups.every(g => g.assignments.every(a => a.teacherName)), [groups]);

  const checkTeacherConflict = (teacherName: string, currentGroupId: string, currentAssignIdx: number) => {
    if (!teacherName) return null;
    
    const currentGroup = groups.find(g => g.id === currentGroupId);
    if (!currentGroup) return null;

    for (const group of groups) {
      const weeksOverlap = Math.max(group.time.startWeek, currentGroup.time.startWeek) <= Math.min(group.time.endWeek, currentGroup.time.endWeek);
      const dayOverlap = group.time.weekday === currentGroup.time.weekday;
      
      if (weeksOverlap && dayOverlap) {
        const parsePeriod = (p: string) => {
          const m = p.match(/(\d+)-(\d+)节/);
          return m ? [Number(m[1]), Number(m[2])] : [0, 0];
        };
        const [s1, e1] = parsePeriod(group.time.period);
        const [s2, e2] = parsePeriod(currentGroup.time.period);
        const periodOverlap = Math.max(s1, s2) <= Math.min(e1, e2);

        if (periodOverlap) {
          const conflictIdx = group.assignments.findIndex((a, idx) => 
            a.teacherName === teacherName && (group.id !== currentGroupId || idx !== currentAssignIdx)
          );
          
          if (conflictIdx !== -1) {
            return {
              courseName: group.courseName,
              labName: group.assignments[conflictIdx].labName,
              time: `${WEEKDAYS[group.time.weekday-1]} ${group.time.session}${group.time.period}`
            };
          }
        }
      }
    }
    return null;
  };

  const handleReset = () => {
    setIsResetModalOpen(true);
  };

  const confirmReset = () => {
    resetSystem();
    setIsResetModalOpen(false);
  };

  const handleSaveProgress = () => {
    const state = useStore.getState();
    const data = {
      step: state.step,
      students: state.students,
      teachers: state.teachers,
      groups: state.groups,
      courses: state.courses,
      totalLabs: state.totalLabs,
      version: '1.1',
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAs(blob, `lab-schedule-progress-${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleLoadProgress = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.students && data.groups) {
          loadState(data);
          alert('进度加载成功！');
        } else {
          alert('无效的进度文件格式。');
        }
      } catch (err) {
        alert('解析文件失败。');
      }
    };
    reader.readAsText(file);
  };

  const handleManualAddStudent = () => {
    if (!manualStudent.id || !manualStudent.name || !manualStudent.className) {
      alert('请填写完整信息！');
      return;
    }
    setStudents([...students, { ...manualStudent, gender: '', major: '' }]);
    setManualStudent({ id: '', name: '', className: '' });
    setShowManualStudent(false);
  };

  // --- Render Steps ---
  const renderStep1 = () => (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <div className="flex flex-col items-center mb-12 text-center">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <LayoutGrid size={16} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter">实验室排课系统</h1>
          </div>
          <p className="text-black/30 text-[10px] font-bold uppercase tracking-widest">Laboratory Scheduling System</p>
      </div>

      <StepNavigation step={1} onStepClick={handleStepClick} nextDisabled={students.length === 0} />

      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-medium tracking-tight mb-2">上传名单</h2>
          <p className="text-black/40">上传学生名单 Excel 文件，这是系统运行的基础。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowManualStudent(true)} icon={Plus} className="px-4 py-2 text-sm">
            手动添加
          </Button>
          {students.length > 0 && (
            <Button variant="danger" onClick={() => setStudents([])} icon={Trash2} className="px-4 py-2 text-sm">
              清空名单
            </Button>
          )}
        </div>
      </div>
      
      {showManualStudent && (
        <Card className="p-6 mb-6 bg-emerald-50/50 border-emerald-100">
          <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-800 mb-4">手动添加学生</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input 
              type="text" placeholder="学号" 
              className="p-3 rounded-xl border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={manualStudent.id}
              onChange={e => setManualStudent({...manualStudent, id: e.target.value})}
            />
            <input 
              type="text" placeholder="姓名" 
              className="p-3 rounded-xl border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={manualStudent.name}
              onChange={e => setManualStudent({...manualStudent, name: e.target.value})}
            />
            <input 
              type="text" placeholder="班级" 
              className="p-3 rounded-xl border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={manualStudent.className}
              onChange={e => setManualStudent({...manualStudent, className: e.target.value})}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowManualStudent(false)} className="px-4 py-2 text-xs">取消</Button>
            <Button onClick={handleManualAddStudent} className="px-4 py-2 text-xs">确认添加</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
        <UploadCard 
          title="学生名单 (必填)" 
          icon={Users} 
          onUpload={handleStudentUpload} 
          count={students.length} 
          summary={studentSummary}
          description="需包含：学号、姓名、性别、专业、班级名称"
          required
        />

        {students.length > 0 && (
          <Card className="p-6 bg-white">
            <h3 className="text-sm font-bold uppercase tracking-widest text-black/30 mb-4">班级概览</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from(new Set(students.map(s => s.className))).sort().map(className => {
                const count = students.filter(s => s.className === className).length;
                return (
                  <div key={className} className="px-3 py-2 bg-[#F5F5F5] rounded-xl flex justify-between items-center">
                    <span className="text-sm font-medium truncate mr-2">{className}</span>
                    <span className="text-xs text-black/40 shrink-0">({count}人)</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        
        <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex items-start gap-4">
          <Info className="text-blue-500 shrink-0 mt-1" size={20} />
          <div className="text-sm text-blue-800 leading-relaxed">
            <p className="font-semibold mb-1">提示</p>
            <p>上传后系统会自动解析班级信息。如果您的 Excel 格式不正确，请参考模版文件。</p>
            <a href="template.zip" className="inline-block mt-2 font-bold underline">下载排课模版.zip</a>
          </div>
        </div>
      </div>
      
      <StepNavigation step={1} onStepClick={handleStepClick} nextDisabled={students.length === 0} className="mt-12" />
      
      <div className="mt-12 pt-8 border-t border-black/5 w-full max-w-md mx-auto text-center">
        <p className="text-[10px] text-black/20 font-bold uppercase tracking-widest mb-2">© 2026 Lab Scheduler · 极简高效的实验室排课方案</p>
        <p className="text-[9px] text-black/10 font-medium">Designed for modern laboratory management with precision and ease.</p>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <StepNavigation step={2} onStepClick={handleStepClick} className="mt-0 mb-8" />
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-medium tracking-tight mb-4">教师管理</h2>
          <p className="text-black/40 text-lg">维护带教教师库，您可以批量导入或手动添加。</p>
        </div>
        {teachers.length > 0 && (
          <Button variant="danger" onClick={() => setTeachers([])} icon={Trash2} className="px-4 py-2 text-sm">
            清空教师
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-8">
          <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><UserPlus size={20} /> 批量添加</h3>
          <textarea 
            placeholder="每行输入一个教师姓名..."
            className="w-full h-48 p-4 rounded-2xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-black/5 mb-4 resize-none"
            value={batchTeacherText}
            onChange={(e) => setBatchTeacherText(e.target.value)}
          />
          <Button onClick={handleBatchTeacher} className="w-full">确认添加</Button>
          <div className="mt-6 pt-6 border-t border-black/5">
            <label className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-black/10 cursor-pointer hover:bg-black/5 transition-colors">
              <Upload size={18} />
              <span className="text-sm font-medium">从 Excel 导入教师</span>
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleTeacherUpload} />
            </label>
          </div>
        </Card>
        
        <Card className="p-8 bg-[#F5F5F5] border-none">
          <h3 className="text-xl font-medium mb-6 flex items-center justify-between">
            <span>教师库</span>
            <span className="text-sm text-black/40 font-normal">共 {teachers.length} 人</span>
          </h3>
          <div className="flex flex-wrap gap-2 max-h-[400px] overflow-y-auto pr-2">
            {teachers.length === 0 ? (
              <p className="text-black/20 text-sm italic">暂无教师数据</p>
            ) : (
              teachers.map((t, i) => (
                <span key={i} className="px-4 py-2 bg-white rounded-full text-sm font-medium border border-black/5 shadow-sm">
                  {t.name}
                </span>
              ))
            )}
          </div>
        </Card>
      </div>
      
      <StepNavigation step={2} onStepClick={handleStepClick} className="mt-12" />
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <StepNavigation step={3} onStepClick={handleStepClick} nextDisabled={groups.length === 0} className="mt-0 mb-8" />
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-medium tracking-tight mb-4">合班管理</h2>
          <p className="text-black/40 text-lg">定义需要排课的课程名称，支持批量导入。</p>
        </div>
        {groups.length > 0 && (
          <Button variant="danger" onClick={() => setGroups([])} icon={Trash2} className="px-4 py-2 text-sm">
            清空课程
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-8">
        <Card className="p-8">
          <div className="flex gap-4 mb-8">
            <textarea 
              placeholder="输入课程名称，每行一个..."
              className="flex-1 p-4 rounded-2xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-black/5 min-h-[120px] resize-none"
              value={batchGroupText}
              onChange={(e) => setBatchGroupText(e.target.value)}
            />
            <Button onClick={handleBatchAddGroup} className="h-fit">批量添加</Button>
          </div>
          
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-medium">已创建课程 ({groups.length})</h3>
          </div>

          <div className="space-y-3">
            {groups.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-black/10 rounded-3xl">
                <p className="text-black/20">暂无课程，请先添加</p>
              </div>
            ) : (
              groups.map(group => (
                <div key={group.id} className="flex items-center justify-between p-4 rounded-2xl bg-[#F5F5F5] group">
                  <div className="flex items-center gap-3">
                    <BookOpen size={18} className="text-black/40" />
                    <div>
                      <span className="font-medium">{group.courseName || '未命名课程'}</span>
                      {group.classNames.length > 0 && (
                        <div className="text-xs text-black/40 mt-1">
                          {group.classNames.join('、')} ({group.totalStudents}人)
                        </div>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    onClick={() => removeGroup(group.id)}
                    icon={Trash2}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500"
                  >
                    删除
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
        
        <div className="bg-black/5 p-6 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-black/40" />
            <span className="text-sm font-medium">已有合班信息 Excel？</span>
          </div>
          <label className="cursor-pointer bg-white px-4 py-2 rounded-xl text-sm font-bold border border-black/10 hover:bg-black/5 transition-colors">
            点击上传
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleGroupUpload} />
          </label>
        </div>
      </div>
      
      <StepNavigation step={3} onStepClick={handleStepClick} nextDisabled={groups.length === 0} className="mt-12" />
    </div>
  );

  const renderStep4 = () => (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <StepNavigation step={4} onStepClick={handleStepClick} nextDisabled={groups.some(g => g.classNames.length === 0 || studentConflicts.length > 0 || labConflicts.length > 0)} className="mt-0 mb-8" />
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-medium tracking-tight mb-4">排课设置</h2>
          <p className="text-black/40 text-lg">为每个课程选择班级并设置上课时间。</p>
        </div>
        <div className="bg-black/5 p-4 rounded-2xl flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/30">实验室总数</span>
            <input 
              type="number" 
              className="bg-transparent text-xl font-medium focus:outline-none w-20"
              value={totalLabs}
              onChange={(e) => setTotalLabs(parseInt(e.target.value) || 0)}
            />
          </div>
          <LayoutGrid className="text-black/20" size={24} />
        </div>
      </div>

      {(studentConflicts.length > 0 || labConflicts.length > 0) && (
        <div className="mb-8 space-y-4">
          {studentConflicts.length > 0 && (
            <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-start gap-4">
              <AlertTriangle className="text-red-500 shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-red-800 mb-1">检测到学生时间冲突</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {studentConflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            </div>
          )}
          {labConflicts.length > 0 && (
            <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex items-start gap-4">
              <AlertTriangle className="text-orange-500 shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-orange-800 mb-1">检测到实验室资源冲突</h4>
                <ul className="text-sm text-orange-700 space-y-1">
                  {labConflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-6">
        {groups.map(group => (
          <TeachingGroupCard 
            key={group.id} 
            group={group} 
            allClassNames={Array.from(new Set(students.map(s => s.className)))}
            studentsPool={students}
            coursePool={courses}
            onUpdate={(u: any) => updateGroup(group.id, u)} 
            onRemove={() => removeGroup(group.id)} 
          />
        ))}
      </div>
      
      <StepNavigation step={4} onStepClick={handleStepClick} nextDisabled={groups.some(g => g.classNames.length === 0 || studentConflicts.length > 0)} className="mt-12" />
    </div>
  );

  const renderStep5 = () => {
    const groupsByCourse = groups.reduce((acc, g) => {
      if (!acc[g.courseName]) acc[g.courseName] = [];
      acc[g.courseName].push(g);
      return acc;
    }, {} as Record<string, CombinedClassGroup[]>);

    return (
      <div className="max-w-5xl mx-auto py-12 px-6">
        <StepNavigation step={5} onStepClick={handleStepClick} nextDisabled={!isAllTeachersAssigned} className="mt-0 mb-8" />
        <div className="mb-12">
          <h2 className="text-4xl font-medium tracking-tight mb-4">实验室和教师分配</h2>
          <p className="text-black/40 text-lg">系统已根据您的设置拆分实验室，请为每个实验室指定带教教师。</p>
        </div>
        
        <div className="space-y-12">
          {Object.entries(groupsByCourse).map(([courseName, courseGroups]) => (
            <div key={courseName} className="space-y-6">
              <h3 className="text-2xl font-bold border-l-4 border-emerald-500 pl-4 py-1">{courseName}</h3>
              <div className="space-y-6">
                {courseGroups.map(group => (
                  <TeacherAssignCard 
                    key={group.id} 
                    group={group} 
                    teachers={teachers} 
                    totalLabs={totalLabs}
                    onUpdate={(u: any) => updateGroup(group.id, u)}
                    checkConflict={checkTeacherConflict}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <StepNavigation step={5} onStepClick={handleStepClick} nextDisabled={!isAllTeachersAssigned} className="mt-12" />
      </div>
    );
  };

  const renderStep6 = () => {
    if (groups.length === 0) {
      return (
        <div className="max-w-6xl mx-auto py-24 px-6 text-center">
          <div className="w-20 h-20 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-6 text-black/20">
            <Calendar size={40} />
          </div>
          <h3 className="text-2xl font-medium text-black/40">暂无排课数据</h3>
          <p className="text-black/20 mt-2">请先完成前面的排课步骤。</p>
          <Button onClick={() => setStep(1)} className="mt-8" variant="secondary">返回第一步</Button>
        </div>
      );
    }

    const activeGroup = groups[activeGroupIdx] || groups[0];
    const activeAssign = activeGroup?.assignments[activeAssignIdx] || activeGroup?.assignments[0];

    return (
      <div className="max-w-6xl mx-auto py-12 px-6 text-center">
        <StepNavigation step={6} onStepClick={handleStepClick} className="mt-0 mb-8" />
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-12"
        >
          <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-5xl font-medium tracking-tight mb-6">排课已完成</h2>
          <p className="text-black/40 text-xl max-w-lg mx-auto leading-relaxed">
            所有课程已成功分配。您可以导出完整的 Excel 工作簿，或在下方预览详细方案。
          </p>
          
          {groups.some(g => g.totalStudents === 0) && (
            <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl max-w-md mx-auto flex items-center gap-3 text-red-600 text-sm">
              <AlertTriangle size={20} />
              <p className="text-left font-medium">警告：发现部分课程组学生人数为 0，请检查班级设置或学生名单。</p>
            </div>
          )}
        </motion.div>
        
        <div className="flex flex-col items-center gap-12">
          <Button 
            onClick={() => exportFullWorkbook(groups, totalLabs)} 
            className="px-12 py-5 text-lg rounded-[24px] shadow-xl shadow-black/10"
            icon={Download}
          >
            导出排课总表 (Excel)
          </Button>
          
          <div className="w-full">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-medium flex items-center gap-3">
                <Calendar size={24} /> 排课方案预览
              </h3>
              <div className="flex bg-black/5 p-1 rounded-2xl">
                {[
                  { id: 'summary', label: '总览表' },
                  { id: 'attendance', label: '成绩单' },
                  { id: 'seating', label: '座位表' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setPreviewMode(mode.id as any)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-medium transition-all",
                      previewMode === mode.id ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {previewMode === 'summary' && (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F5] border-b border-black/5">
                      <th className="p-4 font-bold text-black/40 uppercase tracking-widest text-[10px]">时间</th>
                      <th className="p-4 font-bold text-black/40 uppercase tracking-widest text-[10px]">课程名称</th>
                      <th className="p-4 font-bold text-black/40 uppercase tracking-widest text-[10px]">班级</th>
                      <th className="p-4 font-bold text-black/40 uppercase tracking-widest text-[10px]">实验室和教师分配</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {groups.map(group => (
                      <tr key={group.id} className="hover:bg-black/[0.02] transition-colors">
                        <td className="p-4 whitespace-nowrap">
                          <div className="font-medium">{WEEKDAYS[group.time.weekday-1]}</div>
                          <div className="text-xs text-black/40">{group.time.session} {group.time.period}</div>
                        </td>
                        <td className="p-4 font-medium">{group.courseName}</td>
                        <td className="p-4">
                          <div className="text-xs font-medium">
                            {group.classNames.join(',')} {(() => {
                              const counts: Record<string, number> = {};
                              group.students.forEach(s => counts[s.className] = (counts[s.className] || 0) + 1);
                              return group.classNames.map(name => counts[name] || 0).join('+');
                            })()}={group.totalStudents}人
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {group.assignments.map((a, i) => (
                              <div key={i} className="px-2 py-1 bg-black/5 rounded-lg text-[10px] flex flex-col">
                                <span className="font-bold text-black/40">{a.labName}</span>
                                <span className="font-medium">{a.teacherName}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {(previewMode === 'attendance' || previewMode === 'seating') && (
              <div className="space-y-8">
                <div className="flex flex-wrap gap-4 justify-center">
                  <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-black/5 shadow-sm">
                    <span className="text-xs font-bold text-black/20 uppercase ml-2">选择课程:</span>
                    <select 
                      className="bg-transparent text-sm font-medium outline-none px-2"
                      value={activeGroupIdx}
                      onChange={(e) => { setActiveGroupIdx(Number(e.target.value)); setActiveAssignIdx(0); }}
                    >
                      {groups.map((g, i) => <option key={g.id} value={i}>{g.courseName}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-black/5 shadow-sm">
                    <span className="text-xs font-bold text-black/20 uppercase ml-2">选择实验室:</span>
                    <select 
                      className="bg-transparent text-sm font-medium outline-none px-2"
                      value={activeAssignIdx}
                      onChange={(e) => setActiveAssignIdx(Number(e.target.value))}
                    >
                      {activeGroup?.assignments.map((a, i) => <option key={i} value={i}>{a.labName} ({a.teacherName})</option>)}
                    </select>
                  </div>
                </div>

                {previewMode === 'attendance' && activeGroup && activeAssign && (
                  <Card className="p-8 text-left max-w-5xl mx-auto overflow-x-auto">
                    <div className="border-b border-black/5 pb-6 mb-6">
                      <h4 className="text-2xl font-bold mb-2">{activeGroup.courseName} - {activeAssign.labName} 成绩单</h4>
                      <div className="flex gap-6 text-sm text-black/40">
                        <span>带教教师: <span className="text-black font-medium">{activeAssign.teacherName}</span></span>
                        <span>时间: <span className="text-black font-medium">{WEEKDAYS[activeGroup.time.weekday-1]} {activeGroup.time.session} {activeGroup.time.period}</span></span>
                        <span>学生人数: <span className="text-black font-medium">{activeAssign.studentRange.count} 人</span></span>
                      </div>
                    </div>
                    <table className="w-full text-[11px] border-collapse border border-black/10">
                      <thead>
                        <tr className="bg-[#F5F5F5]">
                          <th rowSpan={2} className="p-2 border border-black/10 text-center w-10">序号</th>
                          <th rowSpan={2} className="p-2 border border-black/10 text-center w-32">学号</th>
                          <th rowSpan={2} className="p-2 border border-black/10 text-center w-24">姓名</th>
                          <th colSpan={9} className="p-1 border border-black/10 text-center">成绩</th>
                          <th rowSpan={2} className="p-2 border border-black/10 text-center w-32">班级</th>
                          <th rowSpan={2} className="p-2 border border-black/10 text-center w-24">备注</th>
                        </tr>
                        <tr className="bg-[#F5F5F5]">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <th key={n} className="p-1 border border-black/10 text-center w-8">{n}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeAssign.studentRange.studentList.map((s, i) => (
                          <tr key={s.id} className="hover:bg-black/[0.01]">
                            <td className="p-2 border border-black/10 text-center">{i + 1}</td>
                            <td className="p-2 border border-black/10 font-mono text-center">{s.id}</td>
                            <td className="p-2 border border-black/10 font-medium text-center">{s.name}</td>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                              <td key={n} className="p-2 border border-black/10"></td>
                            ))}
                            <td className="p-2 border border-black/10 text-center text-[10px] text-black/40">{s.className}</td>
                            <td className="p-2 border border-black/10"></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-4 text-[10px] text-black/30 italic">
                      * 预览格式已同步教务标准成绩表样式
                    </div>
                  </Card>
                )}

                {previewMode === 'seating' && activeGroup && activeAssign && (
                  <div className="max-w-5xl mx-auto">
                    <Card className="p-12">
                      <div className="text-center mb-8">
                        <h4 className="text-lg font-bold mb-4">{activeGroup.classNames.join(',')} {activeAssign.labName} 座位安排</h4>
                        <div className="w-full py-4 bg-black/5 rounded-2xl border border-black/10 font-bold text-xl tracking-[1em] mb-8">讲台</div>
                      </div>
                      
                      <div className="grid grid-cols-[1fr_20px_1fr_20px_1fr_20px_1fr] gap-0 border border-black/10">
                        {/* 4 Columns Seating Preview with Aisles */}
                        {[0, 1, 2, 3].map(colIdx => {
                          const colStudents = colIdx === 0 ? activeAssign.studentRange.studentList.slice(0, 8) :
                                             colIdx === 1 ? activeAssign.studentRange.studentList.slice(8, 16) :
                                             colIdx === 2 ? activeAssign.studentRange.studentList.slice(16, 24) :
                                             activeAssign.studentRange.studentList.slice(24);
                          
                          const maxRows = Math.max(8, activeAssign.studentRange.studentList.length > 24 ? activeAssign.studentRange.studentList.length - 24 : 0);
                          const displayRows = colIdx === 3 ? maxRows : 8;

                          return (
                            <React.Fragment key={colIdx}>
                              <div className="flex flex-col">
                                <div className="grid grid-cols-2 bg-[#F5F5F5] border-b border-black/10">
                                  <div className="p-1 border-r border-black/10 text-[9px] font-bold text-center">学号</div>
                                  <div className="p-1 text-[9px] font-bold text-center">姓名</div>
                                </div>
                                {Array.from({ length: displayRows }).map((_, rowIdx) => {
                                  const student = colStudents[rowIdx];
                                  return (
                                    <div key={rowIdx} className="grid grid-cols-2 border-b border-black/10 min-h-[32px]">
                                      <div className="p-1 border-r border-black/10 text-[9px] font-mono flex items-center justify-center bg-white">
                                        {student?.id || ''}
                                      </div>
                                      <div className="p-1 text-[10px] font-medium flex items-center justify-center bg-white">
                                        {student?.name || ''}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {colIdx < 3 && <div className="bg-black/[0.02] border-x border-black/10" />}
                            </React.Fragment>
                          );
                        })}
                      </div>
                      
                      <div className="mt-12 pt-8 border-t border-black/5 flex justify-between items-center text-black/40">
                        <div className="text-left">
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1">课程信息</p>
                          <p className="text-sm font-medium text-black">{activeGroup.courseName}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1">实验室</p>
                          <p className="text-sm font-medium text-black">{activeAssign.labName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1">带教教师</p>
                          <p className="text-sm font-medium text-black">{activeAssign.teacherName}</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button variant="ghost" onClick={handleReset} icon={RotateCcw}>重置系统</Button>
        </div>
        <StepNavigation step={6} onStepClick={handleStepClick} className="mt-12" />
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Navigation Rail */}
      <div className="w-16 md:w-20 border-r border-black/5 flex flex-col items-center py-6 gap-6 sticky top-0 h-screen bg-white z-50 shrink-0">
        <div className="flex flex-col gap-4 flex-1">
          {[
            { id: 1, icon: Upload, label: '上传名单' },
            { id: 2, icon: UserPlus, label: '教师管理' },
            { id: 3, icon: LayoutGrid, label: '合班管理' },
            { id: 4, icon: Clock, label: '排课设置' },
            { id: 5, icon: Split, label: '实验室和教师分配' },
            { id: 6, icon: CheckCircle2, label: '完成导出' }
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => handleStepClick(s.id)}
              className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex flex-col items-center justify-center transition-all group relative",
                step === s.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "text-black/20 hover:text-emerald-600 hover:bg-emerald-50"
              )}
            >
              <s.icon size={18} />
              <div className="absolute left-full ml-4 px-3 py-2 bg-black text-white rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] translate-x-[-10px] group-hover:translate-x-0 shadow-xl">
                <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-black rotate-45" />
                {s.label}
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setShowAIChat(true)}
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-all group relative"
          >
            <Sparkles size={18} />
            <div className="absolute left-full ml-4 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] translate-x-[-10px] group-hover:translate-x-0 shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-600 rotate-45" />
              AI 助手
            </div>
          </button>

          <button 
            onClick={handleSaveProgress}
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all group relative"
          >
            <Save size={18} />
            <div className="absolute left-full ml-4 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] translate-x-[-10px] group-hover:translate-x-0 shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-600 rotate-45" />
              保存进度 (含名单、教师、合班)
            </div>
          </button>

          <label className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all group relative cursor-pointer">
            <FileUp size={18} />
            <input type="file" accept=".json" className="hidden" onChange={handleLoadProgress} />
            <div className="absolute left-full ml-4 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] translate-x-[-10px] group-hover:translate-x-0 shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-600 rotate-45" />
              加载进度
            </div>
          </label>

          <button 
            onClick={handleReset}
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-all group relative"
          >
            <RotateCcw size={18} />
            <div className="absolute left-full ml-4 px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] translate-x-[-10px] group-hover:translate-x-0 shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-red-600 rotate-45" />
              重置系统
            </div>
          </button>
          
          <button 
            onClick={() => setShowInfo(true)}
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-black/20 hover:text-emerald-600 hover:bg-emerald-50 transition-all group relative"
          >
            <Info size={18} />
            <div className="absolute left-full ml-4 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[100] translate-x-[-10px] group-hover:translate-x-0 shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-600 rotate-45" />
              关于系统
            </div>
          </button>
        </div>

        <div className="mt-4 text-[8px] text-black/10 font-bold uppercase tracking-tighter vertical-text select-none">
          © 2026 Lab Scheduler
        </div>
      </div>


      {/* Main Content */}
      <div className="flex-1 bg-[#FAFAFA]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
            {step === 6 && renderStep6()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showInfo && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-12 max-w-2xl shadow-2xl relative"
            >
              <button onClick={() => setShowInfo(false)} className="absolute top-8 right-8 p-2 hover:bg-black/5 rounded-full transition-colors"><X size={24} /></button>
              <h3 className="text-3xl font-medium mb-6">实验室排课系统使用说明</h3>
              <div className="space-y-6 text-black/60 leading-relaxed overflow-y-auto max-h-[60vh] pr-4">
                <section>
                  <h4 className="text-black font-bold mb-2">1. 数据导入</h4>
                  <p>首先在“上传名单”步骤导入学生 Excel 文件。系统会自动识别班级信息。随后在“教师管理”中维护带教教师库，支持手动输入或 Excel 导入。</p>
                </section>
                <section>
                  <h4 className="text-black font-bold mb-2">2. 合班与排课</h4>
                  <p>在“合班管理”中创建课程，并关联对应的班级。系统会自动计算总人数。在“排课设置”中，您可以为每个合班组设定具体的周次、星期和节次。系统会实时检测学生的时间冲突。</p>
                </section>
                <section>
                  <h4 className="text-black font-bold mb-2">3. 实验室和教师分配</h4>
                  <p>根据基准人数，系统会自动将大班拆分为多个实验室。您需要为每个实验室指定一名带教教师。系统会检测教师的时间冲突，确保同一教师在同一时间不会出现在两个实验室。</p>
                </section>
                <section>
                  <h4 className="text-black font-bold mb-2">4. 结果预览与导出</h4>
                  <p>最后一步提供完整的排课总览、成绩单和座位表预览。您可以一键导出包含所有信息的 Excel 工作簿，方便打印和分发。</p>
                </section>
                <section>
                  <h4 className="text-black font-bold mb-2">5. AI 智能助手</h4>
                  <p>点击左侧闪烁图标可唤起 AI 助手。它支持自然语言指令（如“帮我把周一上午的课都分给张老师”）以及文件解析功能，是您排课的好帮手。</p>
                </section>
                <div className="pt-6 border-t border-black/5 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <p className="text-black font-medium">版本 2.5 Professional</p>
                    <p className="text-sm">智能实验室排课解决方案</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isResetModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-12 max-w-md shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8">
                <RotateCcw size={40} />
              </div>
              <h3 className="text-3xl font-medium mb-4">重置系统？</h3>
              <p className="text-black/40 mb-10 leading-relaxed">此操作将永久删除所有已导入的学生、教师、合班及排课数据。该操作不可撤销。</p>
              <div className="flex gap-4">
                <Button variant="secondary" onClick={() => setIsResetModalOpen(false)} className="flex-1">取消</Button>
                <Button variant="danger" onClick={confirmReset} className="flex-1 bg-red-600 text-white hover:bg-red-700">确认重置</Button>
              </div>
            </motion.div>
          </div>
        )}

        {showAIChat && (
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 md:p-8"
            onClick={() => setShowAIChat(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-4xl h-[85vh] shadow-2xl rounded-[32px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <AIChat onClose={() => setShowAIChat(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Helper Components ---

interface UploadCardProps {
  title: string;
  icon: any;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  count: number;
  description: string;
  summary?: string | null;
  required?: boolean;
}

const UploadCard = ({ title, icon: Icon, onUpload, count, description, summary, required }: UploadCardProps) => (
  <Card className={cn("p-8 transition-all group", required && count === 0 ? "border-black/10" : "border-black/5")}>
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-[#F5F5F5] rounded-2xl flex items-center justify-center text-black group-hover:bg-black group-hover:text-white transition-colors">
          <Icon size={24} />
        </div>
        <div>
          <h3 className="text-xl font-medium">{title}</h3>
          <p className="text-black/40 text-sm mt-1">{description}</p>
        </div>
      </div>
      {count > 0 && (
        <div className="flex items-center gap-2 text-emerald-500 bg-emerald-50 px-4 py-2 rounded-full text-sm font-medium">
          <CheckCircle2 size={16} />
          已导入 {count}
        </div>
      )}
    </div>
    
    {summary && (
      <div className="mb-6 p-4 bg-black/5 rounded-2xl text-sm text-black/60">
        {summary}
      </div>
    )}

    <label className="cursor-pointer bg-black text-white px-6 py-3 rounded-2xl font-medium hover:bg-black/80 transition-all inline-flex items-center gap-2">
      <Upload size={18} />
      选择文件
      <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onUpload} />
    </label>
  </Card>
);

const TeachingGroupCard = ({ group, allClassNames, studentsPool, coursePool, onUpdate, onRemove }: any) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const tailCount = Math.max(0, group.totalStudents - (group.splitConfig.numLabs - 1) * group.splitConfig.baseCapacity);
  
  const periodMatch = group.time.period.match(/(\d+)-(\d+)节/);
  const startP = periodMatch ? Number(periodMatch[1]) : 1;
  const endP = periodMatch ? Number(periodMatch[2]) : 4;

  const getPeriodOptions = () => {
    if (group.time.session === '上午') return Array.from({ length: 5 }, (_, i) => i + 1);
    if (group.time.session === '下午') return Array.from({ length: 8 }, (_, i) => i + 6);
    return [];
  };

  return (
    <Card className="p-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <select 
                className="text-2xl font-medium bg-transparent border-b-2 border-transparent focus:border-black outline-none pb-1 min-w-[200px]"
                value={group.courseName}
                onChange={(e) => onUpdate({ courseName: e.target.value })}
              >
                <option value="">选择课程...</option>
                {coursePool.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Button variant="ghost" onClick={onRemove} icon={Trash2} className="text-red-500" />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="w-full space-y-2">
              <Button variant="outline" onClick={() => setIsModalOpen(true)} icon={Plus}>
                {group.classNames.length > 0 ? `已选 ${group.classNames.length} 个班级` : '选择班级'}
              </Button>
              {group.classNames.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {group.classNames.map((className: string) => {
                    const count = studentsPool.filter((s: any) => s.className === className).length;
                    return (
                      <span key={className} className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1",
                        count === 0 ? "bg-red-50 text-red-600 border border-red-100" : "bg-black/5 text-black"
                      )}>
                        {className} ({count}人)
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newClassNames = group.classNames.filter((cn: string) => cn !== className);
                            const newStudents = studentsPool.filter((s: any) => newClassNames.includes(s.className)).sort((a: any, b: any) => {
                              const classCmp = a.className.localeCompare(b.className);
                              if (classCmp !== 0) return classCmp;
                              return a.id.localeCompare(b.id);
                            });
                            const newTotalStudents = newStudents.length;
                            const newNumLabs = Math.max(1, Math.ceil(newTotalStudents / group.splitConfig.baseCapacity));
                            
                            onUpdate({
                              classNames: newClassNames,
                              totalStudents: newTotalStudents,
                              students: newStudents,
                              splitConfig: { ...group.splitConfig, numLabs: newNumLabs }
                            });
                          }}
                          className="hover:text-red-500 transition-colors ml-1"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-black/5 rounded-xl text-sm font-medium">
              <Users size={16} />
              共 {group.totalStudents} 人
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-3 border-t border-black/5">
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold uppercase tracking-wider text-black/30">周次范围</label>
              <div className="flex items-center gap-1">
                <input 
                  type="number" 
                  className="w-full p-1 bg-[#F5F5F5] rounded-lg text-[10px] font-medium focus:outline-none"
                  value={group.time.startWeek}
                  onChange={(e) => onUpdate({ time: { ...group.time, startWeek: Number(e.target.value) } })}
                />
                <span className="text-black/10">-</span>
                <input 
                  type="number" 
                  className="w-full p-1 bg-[#F5F5F5] rounded-lg text-[10px] font-medium focus:outline-none"
                  value={group.time.endWeek}
                  onChange={(e) => onUpdate({ time: { ...group.time, endWeek: Number(e.target.value) } })}
                />
              </div>
            </div>

            <div className="space-y-0.5">
              <label className="text-[8px] font-bold uppercase tracking-wider text-black/30">星期</label>
              <select 
                className="w-full p-1 bg-[#F5F5F5] rounded-lg text-[10px] font-medium focus:outline-none"
                value={group.time.weekday}
                onChange={(e) => onUpdate({ time: { ...group.time, weekday: Number(e.target.value) } })}
              >
                {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </div>

            <div className="space-y-0.5">
              <label className="text-[8px] font-bold uppercase tracking-wider text-black/30">时段</label>
              <select 
                className="w-full p-1 bg-[#F5F5F5] rounded-lg text-[10px] font-medium focus:outline-none"
                value={group.time.session}
                onChange={(e) => onUpdate({ time: { ...group.time, session: e.target.value as SessionType, period: e.target.value === '上午' ? '1-4节' : '6-9节' } })}
              >
                {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-0.5">
              <label className="text-[8px] font-bold uppercase tracking-wider text-black/30">节次</label>
              <div className="flex items-center gap-1">
                <select 
                  className="w-full p-1 bg-[#F5F5F5] rounded-lg text-[10px] font-medium focus:outline-none"
                  value={startP}
                  onChange={(e) => onUpdate({ time: { ...group.time, period: `${e.target.value}-${endP}节` } })}
                >
                  {getPeriodOptions().map(p => <option key={p} value={p}>{p}节</option>)}
                </select>
                <span className="text-black/10">-</span>
                <select 
                  className="w-full p-1 bg-[#F5F5F5] rounded-lg text-[10px] font-medium focus:outline-none"
                  value={endP}
                  onChange={(e) => onUpdate({ time: { ...group.time, period: `${startP}-${e.target.value}节` } })}
                >
                  {getPeriodOptions().map(p => <option key={p} value={p}>{p}节</option>
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-72 bg-[#F5F5F5] rounded-[24px] p-5 space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-2 text-black/60"><Split size={16} /> 拆分设置</h4>
          
          <div className="space-y-2">
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-black/30">
                <span>实验室数量</span>
                <span className="text-black">{group.splitConfig.numLabs} 间</span>
              </div>
              <input 
                type="range" min="1" max="10" 
                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-black"
                value={group.splitConfig.numLabs}
                onChange={(e) => onUpdate({ splitConfig: { ...group.splitConfig, numLabs: Number(e.target.value) } })}
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-black/30">
                <span>基准人数</span>
                <span className="text-black">{group.splitConfig.baseCapacity} 人</span>
              </div>
              <input 
                type="range" min="10" max="60" 
                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-black"
                value={group.splitConfig.baseCapacity}
                onChange={(e) => onUpdate({ splitConfig: { ...group.splitConfig, baseCapacity: Number(e.target.value) } })}
              />
            </div>

            <div className="pt-2 border-t border-black/5 space-y-2">
              <h5 className="text-[9px] font-bold uppercase tracking-widest text-black/20">座位设置</h5>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[9px] font-medium text-black/40">
                    <span>列数 (默认4)</span>
                    <span className="text-black">{group.splitConfig.columns || 4}</span>
                  </div>
                  <input 
                    type="range" min="1" max="10" 
                    className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-black"
                    value={group.splitConfig.columns || 4}
                    onChange={(e) => onUpdate({ splitConfig: { ...group.splitConfig, columns: Number(e.target.value) } })}
                  />
                </div>

                <div className="space-y-0.5">
                  <div className="flex justify-between text-[9px] font-medium text-black/40">
                    <span>每列 (默认8)</span>
                    <span className="text-black">{group.splitConfig.rows || 8}</span>
                  </div>
                  <input 
                    type="range" min="1" max="20" 
                    className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-black"
                    value={group.splitConfig.rows || 8}
                    onChange={(e) => onUpdate({ splitConfig: { ...group.splitConfig, rows: Number(e.target.value) } })}
                  />
                </div>
              </div>
              
              <div className="text-[8px] text-black/20 text-center font-bold">
                单间总容量: {(group.splitConfig.columns || 4) * (group.splitConfig.rows || 8)} 人
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-black/5 flex justify-between text-[10px]">
            <div className="flex flex-col">
              <span className="text-black/30 uppercase font-bold">前置</span>
              <span className="font-medium">{group.splitConfig.numLabs - 1} × {group.splitConfig.baseCapacity}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-black/30 uppercase font-bold">尾班</span>
              <span className={cn("font-medium", tailCount === 0 ? "text-red-500" : "text-emerald-500")}>{tailCount} 人</span>
            </div>
          </div>
        </div>
      </div>

      <ClassSelectorModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        allClassNames={allClassNames}
        selectedClassNames={group.classNames}
        studentsPool={studentsPool}
        onConfirm={(selected: string[]) => {
          const groupStudents = studentsPool.filter((s: any) => selected.includes(s.className)).sort((a: any, b: any) => {
            const classCmp = a.className.localeCompare(b.className);
            if (classCmp !== 0) return classCmp;
            return a.id.localeCompare(b.id);
          });
          const newNumLabs = Math.max(1, Math.ceil(groupStudents.length / 32));
          onUpdate({ 
            classNames: selected, 
            totalStudents: groupStudents.length, 
            students: groupStudents,
            splitConfig: { ...group.splitConfig, numLabs: newNumLabs }
          });
        }}
      />
    </Card>
  );
};

const TeacherAssignCard = ({ group, teachers, totalLabs, onUpdate, checkConflict }: any) => {
  return (
    <Card className="p-8">
      <div className="border-b border-black/5 pb-6 mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-xl font-bold">上课班级：{group.classNames.join(', ')}</h3>
            <p className="text-black/40 text-sm font-medium">共 {group.totalStudents} 人 · {WEEKDAYS[group.time.weekday-1]} {group.time.session}{group.time.period}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {group.assignments.map((assign: any, idx: number) => {
          const conflict = checkConflict(assign.teacherName, group.id, idx);
          return (
            <div key={idx} className={cn(
              "p-6 rounded-[24px] border transition-all",
              conflict ? "bg-red-50 border-red-100" : "bg-[#F5F5F5] border-transparent"
            )}>
              <div className="flex justify-between items-start mb-4">
                <select 
                  className="text-xs font-bold uppercase tracking-wider text-black/40 bg-transparent border-none outline-none cursor-pointer hover:text-black"
                  value={assign.labName}
                  onChange={(e) => {
                    const newAssigns = [...group.assignments];
                    newAssigns[idx].labName = e.target.value;
                    onUpdate({ assignments: newAssigns });
                  }}
                >
                  {Array.from({ length: totalLabs || 10 }, (_, i) => `实验室${i + 1}`).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <span className="text-xs font-medium bg-white px-2 py-1 rounded-lg shadow-sm">{assign.studentRange.count} 人</span>
              </div>
              
              <div className="space-y-4">
                <select 
                  className="w-full p-3 bg-white rounded-xl text-sm font-medium border border-black/5 focus:outline-none focus:ring-2 focus:ring-black/5"
                  value={assign.teacherName}
                  onChange={(e) => {
                    const newAssigns = [...group.assignments];
                    newAssigns[idx].teacherName = e.target.value;
                    onUpdate({ assignments: newAssigns });
                  }}
                >
                  <option value="">选择教师...</option>
                  {teachers.map((t: any) => {
                    const isAlreadySelected = group.assignments.some((a: any, i: number) => i !== idx && a.teacherName === t.name);
                    if (isAlreadySelected) return null;
                    return <option key={t.name} value={t.name}>{t.name}</option>;
                  })}
                </select>

                {conflict && (
                  <div className="flex items-start gap-2 text-[10px] text-red-600 leading-tight">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <p>冲突：{conflict.courseName} ({conflict.labName})</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const ClassSelectorModal = ({ 
  isOpen, 
  onClose, 
  allClassNames, 
  selectedClassNames, 
  studentsPool, 
  onConfirm 
}: {
  isOpen: boolean;
  onClose: () => void;
  allClassNames: string[];
  selectedClassNames: string[];
  studentsPool: Student[];
  onConfirm: (selected: string[]) => void;
}) => {
  const [search, setSearch] = useState('');
  const [tempSelected, setTempSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedClassNames);
      setSearch('');
    }
  }, [isOpen, selectedClassNames]);

  const groupedClasses = useMemo(() => {
    const groups: Record<string, string[]> = {};
    allClassNames.forEach(cn => {
      const gradeMatch = cn.match(/^\d+/);
      const grade = gradeMatch ? `${gradeMatch[0]}级` : '其他';
      if (!groups[grade]) groups[grade] = [];
      groups[grade].push(cn);
    });
    return groups;
  }, [allClassNames]);

  const filteredGroupedClasses = useMemo(() => {
    if (!search) return groupedClasses;
    const filtered: Record<string, string[]> = {};
    Object.entries(groupedClasses).forEach(([grade, classes]) => {
      const matches = (classes as string[]).filter(cn => cn.toLowerCase().includes(search.toLowerCase()));
      if (matches.length > 0) filtered[grade] = matches;
    });
    return filtered;
  }, [groupedClasses, search]);

  const getClassCount = (className: string) => {
    return studentsPool.filter((s: Student) => s.className === className).length;
  };

  const toggleClass = (className: string) => {
    setTempSelected(prev => 
      prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-8 border-b border-black/5 flex justify-between items-center">
          <h3 className="text-2xl font-medium">选择班级</h3>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors"><X size={24} /></button>
        </div>
        
        <div className="p-6 bg-[#FAFAFA]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20" size={18} />
            <input 
              type="text" 
              placeholder="搜索班级名称..." 
              className="w-full pl-12 pr-4 py-3 bg-white border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {Object.entries(filteredGroupedClasses).length === 0 ? (
            <div className="text-center py-12 text-black/20 italic">未找到匹配班级</div>
          ) : (
            Object.entries(filteredGroupedClasses)
              .sort(([a], [b]) => b.localeCompare(a)) // Sort grades descending
              .map(([grade, classes]) => (
                <div key={grade} className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-black/30 border-b border-black/5 pb-2">{grade}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(classes as string[]).map((cn: string) => (
                      <label key={cn} className="flex items-center justify-between p-4 rounded-2xl hover:bg-[#F5F5F5] cursor-pointer transition-colors group border border-transparent hover:border-black/5">
                        <div className="flex items-center gap-4">
                          <input 
                            type="checkbox" 
                            checked={tempSelected.includes(cn)} 
                            onChange={() => toggleClass(cn)}
                            className="w-5 h-5 rounded-lg border-black/10 text-black focus:ring-black"
                          />
                          <span className="font-medium">{cn}</span>
                        </div>
                        <span className="text-xs font-medium text-black/40 bg-black/5 px-3 py-1 rounded-full">{getClassCount(cn)} 人</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>

        <div className="p-8 border-t border-black/5 flex gap-4 bg-white">
          <Button variant="secondary" onClick={onClose} className="flex-1">取消</Button>
          <Button 
            onClick={() => {
              onConfirm(tempSelected);
              onClose();
            }} 
            className="flex-1"
          >
            确认选择 ({tempSelected.length})
          </Button>
        </div>
      </motion.div>
    </div>
  );
};
