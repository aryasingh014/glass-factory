export type ProductionStage = "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished" | "Dispatched";
export type ProcessRoute = "Route A (Cut -> Finish)" | "Route B (Cut -> Pairing -> DGU -> Finish)" | "Route C (Cut -> Lam -> Finish)" | "Route D (Cut -> Pairing -> Lam -> Pairing -> DGU -> Finish)";
export type GlassStatus = "Pending" | "In Production" | "Completed" | "Rejected" | "Reworking";
export type UserRole = "Admin" | "Operator" | "Supervisor";

export interface GlassItem {
  id: string;
  piId: string;
  piNumber: string;
  serialNumber: string; // e.g. S001 or 1012627013490002
  barcode: string;      // e.g. 1012627013490002
  qrId: string;         // e.g. QR-1012627013490002
  orderNo?: string;     // e.g. 01707 / SFO/SG/262700384
  obNo?: string;        // e.g. 03084 / OB/SG/262700755
  sfoNo?: string;       // e.g. 1348 / SFO No 00384
  batchNo?: string;     // e.g. 1466
  posNo?: string;       // e.g. 1 / POS 1
  customerName?: string;// e.g. ASHBILIA ALUMINIUM / MERAKI FACADE
  projectName?: string; // e.g. DISTRICT_O / HAVEN_BY_A
  srNo?: number;
  itemCode: string;     // e.g. CW-88G1/FACTORY / 4B-AL06-GL01
  glassCode?: string;   // e.g. CW-88G1/FACTORY
  glassType: string;    // e.g. 8MM STOPRAY VISION 40 T CLEAR / 6MM SYP YBE 0140N CLEAR
  width: number;        // mm
  height: number;       // mm
  thickness?: string;   // mm
  qty: number;
  lineQty?: number;     // e.g. 5, 27 (Total position quantity from top header)
  rackNo?: string;      // e.g. "1", "2", "3" (Rack/Stillage lot number from sticker bottom right)
  sqm: number;
  taper?: string;
  holesCutout?: string;
  shape?: string;
  layer?: string;       // e.g. LAYER1 / LAYER2
  sectionName?: string; // e.g. Curtain Wall,Sliding Door,Hung Window & Sliding Window / Fix & Fix with Top Hung Glass
  category?: string;    // e.g. Clear Glass / Coloured Glass
  glassCategory?: "DGU" | "Lamination" | "DLGU"; // Process product category (DGU, Lamination, or DLGU)
  dlguPhase?: "LamPairing" | "DguPairing"; // Active pairing phase for DLGU items
  colorOrClear?: "Clear" | "Colour"; // Glass sticker finish/type
  finish?: "Clear" | "Colour";
  glassColor?: string;  // e.g. Euro Grey, Bronze, Blue, Green, Clear Float, etc.
  delLocation: string;  // FACTORY / SITE
  sketch?: string;      // SKETCH-01
  remarks?: string;     // Ground & 1st Floor-Sliding Glass...
  processRoute: ProductionStage[]; // array of stages e.g. ["Cutting", "Pairing", "DGU", "Finished"]
  currentStage: ProductionStage;
  status: GlassStatus;
  completedStages: ProductionStage[];
  isDispatched?: boolean;
  dispatchedAt?: string;
  dispatchNoteNo?: string;
  vehicleNo?: string;
  driverName?: string;
  delDate?: string;     // e.g. 07/08/2026 (Sticker delivery date)
  optDate?: string;     // e.g. 08/08/2026 (Sticker optimization date)
  makeup?: string;      // e.g. 8MM SYP YBE 0140N / 16MM BLACK SPACER / 13.52MM CLEAR LAMINATED
  createdAt?: string;
  updatedAt: string;
}

export interface PIMaster {
  id: string;
  piNumber: string;      // PI-20260725-001 or PI/SG/262700468
  customerName: string;  // e.g. SEJAL GLASS & GLASS MANUFACTURING PRODUCTS LLC
  batchNo?: string;      // e.g. 5846 / 5826
  jobOrderNumber: string;// e.g. SFO/SG/262700384
  projectName: string;   // e.g. ASTRA TWIN TOWER
  issueDate: string;     // e.g. 2026-07-25
  sfoNo?: string;        // e.g. 00384 / SFO/SG/262700384
  sfoDate?: string;      // e.g. 25-04-2026
  deliveryDate?: string; // e.g. 25-Apr-2026
  proformaInvNo?: string;// e.g. PI/SG/262700468
  fileName?: string;     // e.g. Glass1.pdf
  soNoDate?: string;     // e.g. SO22-10901 / 25-Apr-2026
  refContact?: string;   // e.g. JEET GADA
  dispatchType?: string; // e.g. FACTORY
  invoiceTo?: string;    // e.g. SEJAL GLASS LLC
  dispatchTo?: string;   // e.g. SEJAL GLASS LLC
  obNo?: string;         // e.g. 03084 / OB/SG/262700755
  purchaseOrderNo?: string; // e.g. PO-98765
  version?: string;      // e.g. 1.00
  refGlassWo?: string;   // e.g. GL-009
  refAlumWo?: string;    // e.g. AL-020
  totalQty?: number;
  totalSqm?: number;
  glassDescription?: string;
  glassCategory?: "DGU" | "Lamination" | "DLGU";
  colorOrClear?: "Clear" | "Colour";
  finish?: "Clear" | "Colour";
  glassColor?: string;
  status?: string;
  itemsCount?: number;
  completedItemsCount?: number;
  createdAt?: string;
}

export interface ProductionHistory {
  id: string;
  itemId?: string;
  serialNumber: string;
  barcode?: string;
  piNumber?: string;
  stage: ProductionStage | string;
  action?: string;
  prevStatus?: string;
  newStatus?: string;
  status?: "Completed" | "Rejected" | "Reworking" | string;
  operator: string;
  user?: string;
  itemOrBatch?: string;
  timestamp: string;
  durationMinutes?: number;
  notes?: string;
  remarks?: string;
  scannedBarcode?: string;
}

export interface RejectRecord {
  id: string;
  itemId?: string;
  serialNumber: string;
  barcode?: string;
  piNumber?: string;
  stage: ProductionStage;
  defectStation?: string;
  reason: string;
  defectType?: string;
  defectivePane?: "OP" | "IP" | "LAMI_INNER" | "BOTH_CLEAR" | "ASSEMBLY" | "SINGLE" | string;
  defectiveSerialNumber?: string;
  partnerSerialNumber?: string;
  notes?: string;
  date: string;
  operator: string;
  cost?: number;
}

export interface ReworkRecord {
  id: string;
  itemId?: string;
  serialNumber: string;
  barcode?: string;
  piNumber?: string;
  fromStage: ProductionStage;
  toStage?: ProductionStage;
  targetStage?: ProductionStage;
  defectStation?: string;
  reason: string;
  defectivePane?: "OP" | "IP" | "LAMI_INNER" | "BOTH_CLEAR" | "ASSEMBLY" | "SINGLE" | string;
  defectiveSerialNumber?: string;
  partnerSerialNumber?: string;
  date: string;
  operator: string;
}

export interface DashboardStats {
  totalPI: number;
  stickerUploadCount?: number;
  pendingPI: number;
  completedPI: number;
  pendingCutting: number;
  pendingPairing?: number;
  pendingLamination: number;
  pendingDGU: number;
  finishedItems: number;
  dispatchedItems?: number;
  rejectItems: number;
  reworkItems: number;
}

export interface ReportsResponse {
  pis: PIMaster[];
  items: GlassItem[];
  history: ProductionHistory[];
  rejects: RejectRecord[];
  reworks: ReworkRecord[];
}

export interface StageAnalytics {
  stage: ProductionStage;
  pendingCount: number;
  pendingSqm: number;
  completedCount: number;
  completedSqm: number;
  throughputRate: number; // units per day
  avgCycleTimeMinutes: number;
  capacityUtilization: number; // percentage 0-100
  rejectedCount?: number;
  qualityYield?: number; // percentage 0-100
}

export interface DefectAnalytics {
  reason: string;
  count: number;
  percentage: number;
  stage: ProductionStage | "General";
}

export interface OperatorAnalytics {
  operator: string;
  operationsCount: number;
  completedCount: number;
  rejectCount: number;
  qualityRate: number; // percentage 0-100
}

export interface ProductionTrendPoint {
  date: string;
  itemsCompleted: number;
  sqmCompleted: number;
}

export interface PIFulfillmentAnalytics {
  piNumber: string;
  customerName: string;
  projectName: string;
  totalItems: number;
  completedItems: number;
  totalSqm: number;
  completedSqm: number;
  completionPercentage: number;
  status: string;
  projectedFinishDate: string;
}

export interface BottleneckInfo {
  stage: ProductionStage | string;
  pendingUnits: number;
  pendingSqm: number;
  riskLevel: "Low" | "Medium" | "High";
  avgWaitHours: number;
  bottleneckReason: string;
}

export interface ProductTypeBreakdown {
  type: string;
  count: number;
  sqm: number;
  completedCount: number;
  pendingCount: number;
}

export interface PerformanceAnalyticsData {
  summary: {
    oee: number; // Overall Equipment Effectiveness %
    availability: number; // %
    performance: number; // %
    qualityRate: number; // %
    totalVolumeSqm: number;
    totalGlassItems: number;
    completedGlassItems: number;
    inProgressGlassItems: number;
    completedSqm: number;
    inProgressSqm: number;
    rejectRate: number; // %
    reworkRate: number; // %
    onTimeDeliveryRate: number; // %
    activePIs: number;
    totalPIs: number;
    avgTurnaroundHours: number;
    dispatchedCount: number;
    dispatchedSqm: number;
    bottleneckStage: string;
  };
  stages: StageAnalytics[];
  defects: DefectAnalytics[];
  operators: OperatorAnalytics[];
  dailyTrends: ProductionTrendPoint[];
  piFulfillment: PIFulfillmentAnalytics[];
  productTypeBreakdown: ProductTypeBreakdown[];
  bottlenecks: BottleneckInfo[];
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  category?: "STAGE_ADVANCE" | "REJECTION" | "REWORK" | "BATCH_UPLOAD" | "PI_CREATED" | "PI_RELEASED" | "SYSTEM";
  type: "info" | "success" | "warning" | "destructive";
  stage?: string;
  serialNumber?: string;
  batchNumber?: string;
  piNumber?: string;
  operator?: string;
  timestamp: string;
  rawDate?: number;
  read: boolean;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  ip: string;
  userAgent?: string;
  loginTime: string;
  lastHeartbeat: string;
  status: "Active" | "Idle";
}

export interface RolePermissions {
  role: UserRole;
  description: string;
  allowedModules: string[];
  canUploadPI: boolean;
  canDeletePI: boolean;
  canDispatch: boolean;
  canRejectRework: boolean;
  canViewReports: boolean;
  canViewAnalytics: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canClearData: boolean;
}


