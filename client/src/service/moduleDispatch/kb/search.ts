import { PgClient } from '@/service/pg';
import type { ChatHistoryItemResType, ChatItemType } from '@/types/chat';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { getVector } from '@/pages/api/openapi/plugin/vector';
import { countModelPrice } from '@/service/events/pushBill';
import type { SelectedKbType } from '@/types/plugin';
import type { QuoteItemType } from '@/types/chat';

type KBSearchProps = {
  kbList: SelectedKbType;
  history: ChatItemType[];
  similarity: number;
  limit: number;
  userChatInput: string;
};
export type KBSearchResponse = {
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  isEmpty?: boolean;
  unEmpty?: boolean;
  quoteQA: QuoteItemType[];
};

const moduleName = 'KB Search';

export async function dispatchKBSearch(props: Record<string, any>): Promise<KBSearchResponse> {
  const {
    kbList = [],
    history = [],
    similarity = 0.8,
    limit = 5,
    userChatInput
  } = props as KBSearchProps;

  if (kbList.length === 0) {
    return Promise.reject("You didn't choose the knowledge base");
  }

  if (!userChatInput) {
    return Promise.reject('Your input is empty');
  }

  // get vector
  const vectorModel = global.vectorModels[0];
  const { vectors, tokenLen } = await getVector({
    model: vectorModel.model,
    input: [userChatInput]
  });

  // search kb
  const res: any = await PgClient.query(
    `BEGIN;
    SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
    select kb_id,id,q,a,source from modelData where kb_id IN (${kbList
      .map((item) => `'${item.kbId}'`)
      .join(',')}) AND vector <#> '[${vectors[0]}]' < -${similarity} order by vector <#> '[${
      vectors[0]
    }]' limit ${limit};
    COMMIT;`
  );

  const searchRes: QuoteItemType[] = res?.[2]?.rows || [];

  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    responseData: {
      moduleName,
      price: countModelPrice({ model: vectorModel.model, tokens: tokenLen }),
      model: vectorModel.name,
      tokens: tokenLen,
      similarity,
      limit
    }
  };
}
