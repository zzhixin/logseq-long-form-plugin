export type BlockEntity = {
  id: number;
  uuid: string;
  content: string;
  name?: string;
  properties?: Record<string, unknown>;
  children?: BlockEntity[];
  page?: {
    id: number;
    uuid?: string;
    name?: string;
  };
  parent?: {
    id: number;
    uuid?: string;
  };
};

export type ExportOptions = {
  includeMetaBlocks: boolean;
};
