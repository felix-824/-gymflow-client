import React from 'react';
import Link from 'next/link';
import {
	TableCell,
	TableHead,
	TableBody,
	TableRow,
	Table,
	TableContainer,
	Button,
	Menu,
	Fade,
	MenuItem,
} from '@mui/material';
import Avatar from '@mui/material/Avatar';
import { Stack } from '@mui/material';
import { Program } from '../../../types/program/program';
import { REACT_APP_API_URL } from '../../../config';
import DeleteIcon from '@mui/icons-material/Delete';
import Typography from '@mui/material/Typography';
import { ProgramStatus } from '../../../enums/program.enum';

interface Data {
	id: string;
	title: string;
	price: string;
	trainer: string;
	location: string;
	type: string;
	status: string;
	category: string;
	duration: string;
	capacity: string;
}

type Order = 'asc' | 'desc';

interface HeadCell {
	disablePadding: boolean;
	id: keyof Data;
	label: string;
	numeric: boolean;
}

const headCells: readonly HeadCell[] = [
	{
		id: 'id',
		numeric: true,
		disablePadding: false,
		label: 'ID',
	},
	{
		id: 'title',
		numeric: true,
		disablePadding: false,
		label: 'TITLE',
	},
	{
		id: 'price',
		numeric: false,
		disablePadding: false,
		label: 'PRICE',
	},
	{
		id: 'trainer',
		numeric: false,
		disablePadding: false,
		label: 'TRAINER',
	},
	{
		id: 'location',
		numeric: false,
		disablePadding: false,
		label: 'LOCATION',
	},
	{
		id: 'type',
		numeric: false,
		disablePadding: false,
		label: 'TYPE',
	},
	{
		id: 'status',
		numeric: false,
		disablePadding: false,
		label: 'STATUS',
	},
	{ id: 'category', numeric: false, disablePadding: false, label: 'CATEGORY' },
	{ id: 'duration', numeric: false, disablePadding: false, label: 'MIN/SESSION' },
	{ id: 'capacity', numeric: false, disablePadding: false, label: 'PARTICIPANTS/SESSION' },
];

interface EnhancedTableProps {
	numSelected: number;
	onRequestSort: (event: React.MouseEvent<unknown>, property: keyof Data) => void;
	onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
	order: Order;
	orderBy: string;
	rowCount: number;
}

function EnhancedTableHead(props: EnhancedTableProps) {
	const { onSelectAllClick } = props;

	return (
		<TableHead>
			<TableRow>
				{headCells.map((headCell) => (
					<TableCell
						key={headCell.id}
						align={headCell.numeric ? 'left' : 'center'}
						padding={headCell.disablePadding ? 'none' : 'normal'}
					>
						{headCell.label}
					</TableCell>
				))}
			</TableRow>
		</TableHead>
	);
}

interface ProgramPanelListType {
	programs: Program[];
	anchorEl: any;
	menuIconClickHandler: any;
	menuIconCloseHandler: any;
	updateProgramHandler: any;
	removeProgramHandler: any;
	busy?: boolean;
}

export const ProgramPanelList = (props: ProgramPanelListType) => {
	const {
		programs,
		anchorEl,
		menuIconClickHandler,
		menuIconCloseHandler,
		updateProgramHandler,
		removeProgramHandler,
		busy,
	} = props;

	return (
		<Stack>
			<TableContainer>
				<Table sx={{ minWidth: 750 }} aria-labelledby="tableTitle" size={'medium'}>
					{/*@ts-ignore*/}
					<EnhancedTableHead />
					<TableBody>
						{programs.length === 0 && (
							<TableRow>
								<TableCell align="center" colSpan={headCells.length}>
									<span className={'no-data'}>data not found!</span>
								</TableCell>
							</TableRow>
						)}

						{programs.length !== 0 &&
							programs.map((program: Program, index: number) => {
								const programImage = `${REACT_APP_API_URL}/${program?.programImages[0]}`;

								return (
									<TableRow hover key={program?._id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
										<TableCell align="left">{program._id}</TableCell>
										<TableCell align="left" className={'name'}>
											{program.programStatus === ProgramStatus.ACTIVE ? (
												<Stack direction={'row'}>
													<Link href={`/program/detail?id=${program?._id}`}>
														<div>
															<Avatar alt="Remy Sharp" src={programImage} sx={{ ml: '2px', mr: '10px' }} />
														</div>
													</Link>
													<Link href={`/program/detail?id=${program?._id}`}>
														<div>{program.programName}</div>
													</Link>
												</Stack>
											) : (
												<Stack direction={'row'}>
													<div>
														<Avatar alt="Remy Sharp" src={programImage} sx={{ ml: '2px', mr: '10px' }} />
													</div>
													<div style={{ marginTop: '10px' }}>{program.programName}</div>
												</Stack>
											)}
										</TableCell>
										<TableCell align="center">₩{program.programPrice.toLocaleString()} /session</TableCell>
										<TableCell align="center">{program.memberData?.memberNick}</TableCell>
										<TableCell align="center">{program.programLocation}</TableCell>
										<TableCell align="center">{program.programType}</TableCell>
										<TableCell align="center">
											{program.programStatus === ProgramStatus.DELETE && (
												<Button
													disabled={busy}
													variant="outlined"
													sx={{ p: '3px', border: 'none', ':hover': { border: '1px solid #000000' } }}
													onClick={() => removeProgramHandler(program._id)}
												>
													<DeleteIcon fontSize="small" />
													DELETE
												</Button>
											)}

											{program.programStatus !== ProgramStatus.DELETE && (
												<>
													<Button
														disabled={busy}
														onClick={(e: any) => menuIconClickHandler(e, index)}
														className={'badge success'}
													>
														{program.programStatus}
													</Button>

													<Menu
														className={'menu-modal'}
														MenuListProps={{
															'aria-labelledby': 'fade-button',
														}}
														anchorEl={anchorEl[index]}
														open={Boolean(anchorEl[index])}
														onClose={menuIconCloseHandler}
														TransitionComponent={Fade}
														sx={{ p: 1 }}
													>
														{Object.values(ProgramStatus)
															.filter((ele) => ele !== program.programStatus)
															.map((status: string) => (
																<MenuItem
																	onClick={() => updateProgramHandler({ _id: program._id, programStatus: status })}
																	key={status}
																>
																	<Typography variant={'subtitle1'} component={'span'}>
																		{status}
																	</Typography>
																</MenuItem>
															))}
													</Menu>
												</>
											)}
										</TableCell>
										<TableCell align="center">{program.programCategory}</TableCell>
										<TableCell align="center">{program.programDuration}</TableCell>
										<TableCell align="center">{program.programCapacity}</TableCell>
									</TableRow>
								);
							})}
					</TableBody>
				</Table>
			</TableContainer>
		</Stack>
	);
};
