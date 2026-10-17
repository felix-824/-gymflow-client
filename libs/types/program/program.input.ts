import { ProgramCategory, ProgramLocation, ProgramStatus, ProgramType } from '../../enums/program.enum';
import { Direction } from '../../enums/common.enum';

export interface ProgramInput {
	programType: ProgramType;
	programCategory: ProgramCategory;
	programLocation: ProgramLocation;
	programName: string;
	programPrice: number;
	programDuration: number;
	programCapacity: number;
	programImages: string[];
	programAddress?: string | null;
	programDesc?: string | null;
}

export interface ProgramCreateInput extends ProgramInput {
	createRequestId: string;
}

export interface ProgramSearch {
	memberId?: string;
	locationList?: ProgramLocation[];
	typeList?: ProgramType[];
	categoryList?: ProgramCategory[];
	pricesRange?: { start: number; end: number };
	periodsRange?: { start: string | Date; end: string | Date };
	text?: string;
}

export interface ProgramsInquiry {
	page: number;
	limit: number;
	sort?: string;
	direction?: Direction;
	search: ProgramSearch;
}

export interface TrainerProgramsInquiry extends Omit<ProgramsInquiry, 'search'> {
	search: ProgramSearch & { programStatus?: ProgramStatus };
}

export interface AllProgramsInquiry extends TrainerProgramsInquiry {}
