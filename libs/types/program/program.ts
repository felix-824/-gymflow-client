import { ProgramCategory, ProgramLocation, ProgramStatus, ProgramType } from '../../enums/program.enum';
import { PublicMember } from '../member/member';

export interface MeLiked {
	memberId: string;
	likeRefId: string;
	myFavorite: boolean;
}

export interface TotalCounter {
	total: number;
}

export interface Program {
	_id: string;
	programType: ProgramType;
	programCategory: ProgramCategory;
	programStatus: ProgramStatus;
	programLocation: ProgramLocation;
	programName: string;
	programAddress?: string | null;
	programPrice: number;
	programDuration: number;
	programCapacity: number;
	programImages: string[];
	programDesc?: string | null;
	programViews: number;
	programLikes: number;
	programRank: number;
	memberId: string;
	deletedAt?: Date | string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
	meLiked?: MeLiked[];
	memberData?: PublicMember | null;
}

export interface Programs {
	list: Program[];
	metaCounter?: TotalCounter[] | null;
}
