// Centralized API Handler with Mock Data

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // BACKEND INTEGRATION POINT: POST /api/auth/login
  login: async (credentials?: any) => {
    await delay(1000);
    return {
      user: {
        id: '1',
        name: 'Alex Developer',
        email: 'alex@example.com',
        avatar: 'https://i.pravatar.cc/150?u=1'
      },
      token: 'mock-jwt-token-123'
    };
  },

  // BACKEND INTEGRATION POINT: GET /api/user/dashboard
  getDashboard: async () => {
    await delay(800);
    return {
      stats: {
        interviewsTaken: 12,
        avgScore: 85,
        improvementPercent: 15
      },
      recentInterviews: [
        { id: '101', role: 'Frontend Engineer', date: '2026-04-10', score: 88, status: 'completed' },
        { id: '102', role: 'Full Stack Developer', date: '2026-04-05', score: 82, status: 'completed' },
        { id: '103', role: 'React Developer', date: '2026-03-28', score: 79, status: 'completed' }
      ]
    };
  },

  // BACKEND INTEGRATION POINT: GET /api/interview/questions
  getQuestions: async () => {
    await delay(1000);
    return [
      { id: 'q1', text: 'Explain how React Context differs from Redux or Zustand.', type: 'technical', durationSeconds: 120 },
      { id: 'q2', text: 'Describe a time you had to resolve a difficult conflict with a team member.', type: 'behavioral', durationSeconds: 150 },
      { id: 'q3', text: 'How would you design a scalable notification system?', type: 'system-design', durationSeconds: 180 }
    ];
  },

  // BACKEND INTEGRATION POINT: POST /api/interview/start
  startInterview: async () => {
    await delay(500);
    return { sessionId: 'session-' + Date.now() };
  },

  // BACKEND INTEGRATION POINT: POST /api/interview/response
  sendResponse: async (data: { questionId: string; responseBlob?: Blob | null; textResponse?: string }) => {
    await delay(1500); // Simulate upload and processing time
    return { success: true, processedAt: new Date().toISOString() };
  },

  // BACKEND INTEGRATION POINT: GET /api/interview/result/{id}
  getResult: async (id: string) => {
    await delay(2000); // Simulate analysis time
    return {
      overallScore: 86,
      emotionAnalysis: {
        confidence: 90,
        nervousness: 25,
        clarity: 85
      },
      answerQuality: 88,
      strengths: [
        'Clear articulation of technical concepts',
        'Maintained good eye contact',
        'Structured answers well'
      ],
      weaknesses: [
        'Slight hesitation during system design question',
        'Could use more concrete examples in behavioral responses'
      ],
      suggestedImprovements: [
        'Practice STAR method for behavioral questions',
        'Review distributed systems patterns for faster recall'
      ]
    };
  },

  // BACKEND INTEGRATION POINT: GET /api/user/profile
  getProfile: async () => {
    await delay(500);
    return {
      name: 'Alex Developer',
      email: 'alex@example.com',
      joinedAt: '2025-10-01',
      interviewsCompleted: 12
    };
  }
};
