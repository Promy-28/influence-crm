import {requireSession} from '@/lib/db';
import {reviewWorkspace} from '@/lib/creator-review-workspace';
import CreatorBrowserReview from '@/components/CreatorBrowserReview';
export const dynamic='force-dynamic';
export default async function BrowserReview(){await requireSession();return <CreatorBrowserReview initial={await reviewWorkspace()}/>}
