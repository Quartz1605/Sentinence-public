"use client";

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";

interface EmotionRadarProps {
  data: {
    confidence: number;
    nervousness: number;
    clarity: number;
  };
}

export function EmotionRadar({ data }: EmotionRadarProps) {
  const chartData = [
    { subject: 'Confidence', A: data.confidence, fullMark: 100 },
    { subject: 'Clarity', A: data.clarity, fullMark: 100 },
    { subject: 'Nervousness', A: 100 - data.nervousness, fullMark: 100 }, // Inverted for positive correlation
  ];

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#3f3f46" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Score"
            dataKey="A"
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
