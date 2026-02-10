"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { FrequencyMeasurement } from "@/lib/types";
import styles from "@/components/ResponseChart.module.css";

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  measurements: FrequencyMeasurement[];
}

interface ResponseChartProps {
  series: ChartSeries[];
}

export function ResponseChart({ series }: ResponseChartProps) {
  const chartData = useMemo(() => {
    const frequencies = new Set<number>();

    for (const entry of series) {
      for (const measurement of entry.measurements) {
        frequencies.add(measurement.freqHz);
      }
    }

    const sorted = Array.from(frequencies).sort((a, b) => a - b);

    return sorted.map((freq) => {
      const row: Record<string, number> = { freqHz: freq };

      for (const entry of series) {
        const point = entry.measurements.find((measurement) => measurement.freqHz === freq);
        row[entry.id] = point?.levelRelDb ?? 0;
      }

      return row;
    });
  }, [series]);

  if (!chartData.length) {
    return <p className="muted">No chart data available.</p>;
  }

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d0c8bc" />
          <XAxis
            type="number"
            dataKey="freqHz"
            scale="log"
            domain={[20, 140]}
            ticks={[25, 31.5, 40, 50, 63, 80, 100, 125]}
            tickFormatter={(value) => `${value}`}
          />
          <YAxis unit=" dB" domain={[-20, 20]} />
          <ReferenceLine y={0} stroke="#6e7e8a" strokeDasharray="4 4" />
          <Tooltip formatter={(value: number) => `${value.toFixed(1)} dB`} labelFormatter={(value) => `${value} Hz`} />
          <Legend />
          {series.map((entry) => (
            <Line
              key={entry.id}
              type="monotone"
              dataKey={entry.id}
              name={entry.name}
              stroke={entry.color}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
