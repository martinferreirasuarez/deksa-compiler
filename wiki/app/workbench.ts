import workbenchJson from '../content/workbench.json';

export type LotStatus = 'pending' | 'draft' | 'review' | 'accepted';

export type LotIndexEntry = {
  id: string;
  arc: string;
  title: string;
  status: LotStatus;
  artifact: string | null;
};

export type ExperimentIndexEntry = {
  id: string;
  title: string;
  status: 'running' | 'review' | 'accepted' | 'rejected';
  artifact: string;
};

export type TrainerExperimentIndexEntry = {
  id: string;
  title: string;
  status: 'running' | 'review' | 'accepted' | 'rejected';
  lot: string;
  faunaRunId: string;
  artifact: string;
  stateArtifact: string;
  modelEffort: 'high';
};

export type Workbench = {
  schemaVersion: 1;
  workspace: 'beta-3';
  visibility: 'private-workbench';
  contentState: 'empty' | 'authoring';
  contentRevision: string;
  activeFaunaModel: string | null;
  activeFaunaPublication: string | null;
  activeTrainerPublication: string | null;
  experiments: ExperimentIndexEntry[];
  trainerExperiments: TrainerExperimentIndexEntry[];
  lots: LotIndexEntry[];
};

export const workbench = workbenchJson as Workbench;

export function lotHref(
  id: string,
  faunaRunId?: string,
  view?: 'fauna' | 'trainers' | 'items' | 'maps',
  trainerSet?: 'A' | 'B' | 'C',
) {
  const path = `/archivo/beta4/lotes/${id.toLowerCase()}`;
  const query = new URLSearchParams();
  if (faunaRunId) query.set('seed', faunaRunId);
  if (view) query.set('view', view);
  if (view === 'trainers' && trainerSet) query.set('set', trainerSet);
  return query.size > 0 ? `${path}?${query.toString()}` : path;
}

export function lotById(id: string) {
  return workbench.lots.find((lot) => lot.id === id.toUpperCase());
}

export const lotStatusLabel: Record<LotStatus, string> = {
  pending: 'Pendiente',
  draft: 'Borrador',
  review: 'En revisión',
  accepted: 'Aceptado',
};
