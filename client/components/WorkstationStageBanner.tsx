import React from "react";
import { ProductionStage } from "@shared/api";

export interface WorkstationStageBannerProps {
  stage: ProductionStage;
  totalItems: number;
  totalSqm: number;
  readyCount?: number;
  completedTodayCount?: number;
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

export const WorkstationStageBanner: React.FC<WorkstationStageBannerProps> = () => {
  return null;
};
