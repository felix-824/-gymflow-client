import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
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
	Avatar,
	useMediaQuery,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded';
import { Program } from '../../../types/program/program';
import { REACT_APP_API_URL } from '../../../config';
import { ProgramStatus, ProgramType } from '../../../enums/program.enum';
import { adminProgramsLabels } from '../../../admin-programs-labels';

type Labels = ReturnType<typeof adminProgramsLabels>;
interface ProgramPanelListType {
	programs: Program[];
	anchorEl: any;
	menuIconClickHandler: any;
	menuIconCloseHandler: any;
	updateProgramHandler: any;
	removeProgramHandler: any;
	busy?: boolean;
	feedback?: React.ReactNode;
}
const locationLabel = (program: Program, labels: Labels) =>
	program.programType === ProgramType.ONLINE ? labels.types.ONLINE : labels.locations[program.programLocation];

const ProgramIdentity = ({ program }: { program: Program }) => {
	const content = (
		<>
			<Avatar
				variant="rounded"
				alt=""
				src={program.programImages?.[0] ? `${REACT_APP_API_URL}/${program.programImages[0]}` : undefined}
			>
				<FitnessCenterRoundedIcon aria-hidden="true" />
			</Avatar>
			<strong>{program.programName}</strong>
		</>
	);
	return program.programStatus === ProgramStatus.ACTIVE ? (
		<Link className="program-identity" href={`/program/detail?id=${program._id}`}>
			{content}
		</Link>
	) : (
		<div className="program-identity">{content}</div>
	);
};
const ProgramDetails = ({ program, labels }: { program: Program; labels: Labels }) => (
	<details className="program-details">
		<summary aria-label={`${labels.details}: ${program.programName}`}>
			{labels.details}
			<ExpandMoreRoundedIcon aria-hidden="true" />
		</summary>
		<dl>
			<div>
				<dt>{labels.programId}</dt>
				<dd className="program-technical-id">{program._id}</dd>
			</div>
			<div>
				<dt>{labels.location}</dt>
				<dd>{locationLabel(program, labels)}</dd>
			</div>
			<div>
				<dt>{labels.category}</dt>
				<dd>{labels.categories[program.programCategory]}</dd>
			</div>
			<div>
				<dt>{labels.duration}</dt>
				<dd>{program.programDuration}</dd>
			</div>
			<div>
				<dt>{labels.capacity}</dt>
				<dd>{program.programCapacity}</dd>
			</div>
		</dl>
	</details>
);
const ProgramControl = ({
	program,
	index,
	labels,
	controls,
}: {
	program: Program;
	index: number;
	labels: Labels;
	controls: ProgramPanelListType;
}) => {
	const id = 'program-status-' + program._id;
	const anchor = controls.anchorEl[index];
	const open = Boolean(anchor?.isConnected);
	return program.programStatus === ProgramStatus.DELETE ? (
		<Button
			className="program-control is-delete"
			disabled={controls.busy}
			aria-label={`${labels.remove}: ${program.programName}`}
			onClick={() => controls.removeProgramHandler(program._id)}
			startIcon={<DeleteOutlineRoundedIcon />}
		>
			{labels.statuses.DELETE}
		</Button>
	) : (
		<>
			<Button
				id={id}
				className={`program-control is-${program.programStatus.toLowerCase()}`}
				disabled={controls.busy}
				aria-label={`${labels.changeStatus}: ${program.programName}, ${labels.statuses[program.programStatus]}`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id + '-menu' : undefined}
				onClick={(event) => controls.menuIconClickHandler(event, index)}
				endIcon={<ExpandMoreRoundedIcon />}
			>
				{labels.statuses[program.programStatus]}
			</Button>
			<Menu
				className="admin-programs-menu"
				anchorEl={open ? anchor : null}
				open={open}
				onClose={controls.menuIconCloseHandler}
				TransitionComponent={Fade}
				MenuListProps={{ id: id + '-menu', 'aria-labelledby': id }}
			>
				{Object.values(ProgramStatus)
					.filter((status) => status !== program.programStatus)
					.map((status) => (
						<MenuItem
							key={status}
							disabled={controls.busy}
							onClick={() =>
								controls.updateProgramHandler({
									_id: program._id,
									programStatus: status,
									expectedRevision: program.programRevision,
								})
							}
						>
							{labels.statuses[status]}
						</MenuItem>
					))}
			</Menu>
		</>
	);
};
export const ProgramPanelList = (props: ProgramPanelListType) => {
	const { programs, feedback } = props;
	const locale = useRouter().locale;
	const labels = adminProgramsLabels(locale);
	const mobile = useMediaQuery('(max-width:599px)');
	const price = (program: Program) => (
		<span className="program-price">
			<strong>
				₩{program.programPrice.toLocaleString(locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US')}
			</strong>
			<small>{labels.perSession}</small>
		</span>
	);
	if (feedback || !programs.length) return <div className="program-feedback">{feedback ?? <p>{labels.empty}</p>}</div>;
	return mobile ? (
		<ul className="program-mobile-list" aria-label={labels.title}>
			{programs.map((program, index) => (
				<li className="program-mobile-row" key={program._id}>
					<ProgramIdentity program={program} />
					<p className="program-mobile-trainer">
						<span>{labels.trainer}</span>
						<strong>{program.memberData?.memberNick ?? '—'}</strong>
					</p>
					<div className="program-mobile-operation">
						<div>
							{price(program)}
							<span className="program-type">{labels.types[program.programType]}</span>
						</div>
						<ProgramControl program={program} index={index} labels={labels} controls={props} />
					</div>
					<p className="program-mobile-context">
						{locationLabel(program, labels)} · {labels.categories[program.programCategory]}
					</p>
					<ProgramDetails program={program} labels={labels} />
				</li>
			))}
		</ul>
	) : (
		<TableContainer>
			<Table aria-label={labels.title} className="program-table">
				<TableHead>
					<TableRow>
						{[
							['program', labels.program],
							['trainer', labels.trainer],
							['price', labels.price],
							['type', labels.type],
							['status', labels.status],
							['context', labels.context],
						].map(([key, label]) => (
							<TableCell className={'program-col-' + key} key={key}>
								{label}
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{programs.map((program, index) => (
						<TableRow hover key={program._id}>
							<TableCell className="program-col-program">
								<ProgramIdentity program={program} />
								<span className="program-tablet-type">{labels.types[program.programType]}</span>
								<ProgramDetails program={program} labels={labels} />
							</TableCell>
							<TableCell className="program-col-trainer">
								<span className="program-trainer">{program.memberData?.memberNick ?? '—'}</span>
							</TableCell>
							<TableCell className="program-col-price">{price(program)}</TableCell>
							<TableCell className="program-col-type">{labels.types[program.programType]}</TableCell>
							<TableCell className="program-col-status">
								<ProgramControl program={program} index={index} labels={labels} controls={props} />
							</TableCell>
							<TableCell className="program-col-context">
								<span>{locationLabel(program, labels)}</span>
								<small>{labels.categories[program.programCategory]}</small>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	);
};
