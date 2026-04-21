import { create } from 'zustand';

export interface Question {
  id: string;
  text: string;
  type: 'technical' | 'behavioral' | 'system-design';
  durationSeconds: number;
}

interface InterviewState {
  isRecording: boolean;
  currentQuestionIndex: number;
  questions: Question[];
  responses: Array<{ questionId: string; responseBlob: Blob | null; textResponse?: string }>;
  status: 'idle' | 'in-progress' | 'analyzing' | 'completed';
  setRecording: (isRecording: boolean) => void;
  setQuestions: (questions: Question[]) => void;
  addResponse: (questionId: string, responseBlob: Blob | null, textResponse?: string) => void;
  nextQuestion: () => void;
  setStatus: (status: 'idle' | 'in-progress' | 'analyzing' | 'completed') => void;
  reset: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  isRecording: false,
  currentQuestionIndex: 0,
  questions: [],
  responses: [],
  status: 'idle',
  setRecording: (isRecording) => set({ isRecording }),
  setQuestions: (questions) => set({ questions }),
  addResponse: (questionId, responseBlob, textResponse) => 
    set((state) => ({ 
      responses: [...state.responses, { questionId, responseBlob, textResponse }] 
    })),
  nextQuestion: () => set((state) => ({ currentQuestionIndex: state.currentQuestionIndex + 1 })),
  setStatus: (status) => set({ status }),
  reset: () => set({ 
    isRecording: false, 
    currentQuestionIndex: 0, 
    questions: [], 
    responses: [], 
    status: 'idle' 
  }),
}));
