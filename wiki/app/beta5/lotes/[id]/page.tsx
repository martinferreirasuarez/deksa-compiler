import { renderLotPage } from '../../../lotes/[id]/page';

export const dynamic = 'force-dynamic';

export default function Page(props: Parameters<typeof renderLotPage>[0]) {
  return renderLotPage(props, true);
}
