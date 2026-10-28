// The task file, bundled at build time.

import raw from '../../../clicktest/tasks.yaml?raw';
import { parseTasks } from './parseTasks';


export const TASK_FILE = parseTasks(raw);
