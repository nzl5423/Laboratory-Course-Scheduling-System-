import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Student, Teacher, CombinedClassGroup } from '../types';

interface AppState {
  step: number;
  students: Student[];
  teachers: Teacher[];
  groups: CombinedClassGroup[];
  courses: string[];
  totalLabs: number;
  
  // AI Settings (Not persisted)
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  aiMessages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  
  setStep: (step: number) => void;
  setStudents: (students: Student[]) => void;
  setTeachers: (teachers: Teacher[]) => void;
  setGroups: (groups: CombinedClassGroup[]) => void;
  
  addCourse: (courseName: string) => void;
  addGroup: (group: CombinedClassGroup) => void;
  batchAddGroups: (groups: CombinedClassGroup[]) => void;
  updateGroup: (id: string, updates: Partial<CombinedClassGroup>) => void;
  removeGroup: (id: string) => void;
  
  setTotalLabs: (count: number) => void;
  resetSystem: () => void;
  loadState: (state: Partial<AppState>) => void;

  // AI Actions
  setAiApiKey: (key: string) => void;
  setAiBaseUrl: (url: string) => void;
  setAiModel: (model: string) => void;
  addAiMessage: (message: { role: 'user' | 'assistant' | 'system'; content: string }) => void;
  clearAiMessages: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      step: 1,
      students: [],
      teachers: [],
      groups: [],
      courses: [],
      totalLabs: 10,

      aiApiKey: '',
      aiBaseUrl: 'https://api.openai.com/v1',
      aiModel: 'gpt-4o',
      aiMessages: [],

      setStep: (step) => set({ step }),
      setStudents: (students) => set({ students }),
      setTeachers: (teachers) => set({ teachers }),
      setGroups: (groups) => set({ groups }),

      addCourse: (courseName) => {
        if (!courseName) return;
        set((state) => ({
          courses: Array.from(new Set([...state.courses, courseName]))
        }));
      },

      addGroup: (group) => {
        const { groups } = get();
        set({ groups: [...groups, group] });
        get().addCourse(group.courseName);
      },

      batchAddGroups: (newGroups) => {
        const { groups } = get();
        set({ groups: [...groups, ...newGroups] });
        newGroups.forEach(g => get().addCourse(g.courseName));
      },

      updateGroup: (id, updates) => {
        const { groups } = get();
        const newGroups = groups.map((g) => (g.id === id ? { ...g, ...updates } : g));
        set({ groups: newGroups });
        if (updates.courseName) {
          get().addCourse(updates.courseName);
        }
      },

      removeGroup: (id) => {
        const { groups } = get();
        set({ groups: groups.filter((g) => g.id !== id) });
      },

      setTotalLabs: (totalLabs) => set({ totalLabs }),

      loadState: (newState) => {
        set((state) => ({
          ...state,
          ...newState,
          // Ensure we don't overwrite AI settings from a file unless we want to
          aiApiKey: state.aiApiKey,
          aiBaseUrl: state.aiBaseUrl,
          aiMessages: state.aiMessages,
        }));
      },

      setAiApiKey: (aiApiKey) => set({ aiApiKey }),
      setAiBaseUrl: (aiBaseUrl) => set({ aiBaseUrl }),
      setAiModel: (aiModel) => set({ aiModel }),
      addAiMessage: (message) => set((state) => ({ aiMessages: [...state.aiMessages, message] })),
      clearAiMessages: () => set({ aiMessages: [] }),

      resetSystem: () => {
        // Clear all storage and reset state
        try {
          localStorage.removeItem('lab-schedule-storage');
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          console.error(e);
        }
        
        set({
          step: 1,
          students: [],
          teachers: [],
          groups: [],
          courses: [],
          totalLabs: 10,
        });
        
        // Hard reload to ensure all local state is wiped
        window.location.href = window.location.origin + window.location.pathname;
      },
    }),
    {
      name: 'lab-schedule-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { aiApiKey, aiBaseUrl, aiModel, aiMessages, ...rest } = state;
        return rest;
      },
    }
  )
);
