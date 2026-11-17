import 'server-only';
import {cookies,headers} from 'next/headers';
import {MODE_COOKIE,normalizedMode} from './workspace-mode-core';
export async function workspaceMode(){return normalizedMode((await headers()).get('x-promy-workspace-mode'))||normalizedMode((await cookies()).get(MODE_COOKIE)?.value)||'reddit'}
