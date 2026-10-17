import { ProgramStatus } from '../../enums/program.enum';
import { ProgramInput } from './program.input';

export interface ProgramUpdate extends Partial<ProgramInput> {
	_id: string;
	expectedRevision: number;
	programStatus?: ProgramStatus;
}
