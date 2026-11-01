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
import { Member } from '../../../types/member/member';
import { MemberUpdate } from '../../../types/member/member.update';
import { REACT_APP_API_URL } from '../../../config';
import { MemberStatus, MemberType } from '../../../enums/member.enum';
import { adminUsersLabels } from '../../../admin-users-labels';

interface MemberPanelListType {
	members: Member[];
	anchorEl: any;
	menuIconClickHandler: (event: React.MouseEvent<HTMLElement>, key: number | string) => void;
	menuIconCloseHandler: () => void;
	updateMemberHandler: (input: MemberUpdate) => void;
	pending?: boolean;
}
type Labels = ReturnType<typeof adminUsersLabels>;

const MemberIdentity = ({ member }: { member: Member }) => (
	<Link href={'/member?memberId=' + member._id} passHref className="member-identity">
		<Avatar
			alt=""
			src={member.memberImage ? REACT_APP_API_URL + '/' + member.memberImage : '/img/profile/defaultUser.svg'}
		>
			{member.memberNick?.charAt(0)}
		</Avatar>
		<span>
			<strong>{member.memberNick}</strong>
			{member.memberFullName && <small>{member.memberFullName}</small>}
		</span>
	</Link>
);

const MemberDetails = ({ member, labels }: { member: Member; labels: Labels }) => (
	<details className="member-details">
		<summary aria-label={labels.details + ': ' + member.memberNick}>
			{labels.details}
			<ExpandMoreRoundedIcon aria-hidden="true" />
		</summary>
		<dl>
			<div>
				<dt>{labels.memberId}</dt>
				<dd className="member-technical-id">{member._id}</dd>
			</div>
			<div className="member-secondary-count">
				<dt>{labels.warnings}</dt>
				<dd>{member.memberWarnings ?? 0}</dd>
			</div>
			<div className="member-secondary-count">
				<dt>{labels.blocks}</dt>
				<dd>{member.memberBlocks ?? 0}</dd>
			</div>
		</dl>
	</details>
);

const MemberControl = ({
	member,
	index,
	field,
	labels,
	controls,
}: {
	member: Member;
	index: number;
	field: 'memberType' | 'memberStatus';
	labels: Labels;
	controls: MemberPanelListType;
}) => {
	const role = field === 'memberType';
	const key = role ? index : member._id;
	const anchor = controls.anchorEl[key];
	const open = Boolean(anchor?.isConnected);
	const id = 'member-' + member._id + '-' + field;
	const label = role ? labels.roles[member.memberType] : labels.statuses[member.memberStatus];
	const choices = role
		? Object.values(MemberType).filter(
				(type) => type !== member.memberType && !(member.memberType === MemberType.USER && type === MemberType.TRAINER),
		  )
		: Object.values(MemberStatus).filter((status) => status !== member.memberStatus);
	return (
		<>
			<Button
				id={id}
				className={'member-control ' + (role ? 'member-role' : 'member-state state-' + member.memberStatus)}
				disabled={controls.pending}
				aria-label={(role ? labels.changeType : labels.changeState) + ': ' + member.memberNick + ', ' + label}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id + '-menu' : undefined}
				onClick={(event) => controls.menuIconClickHandler(event, key)}
				endIcon={<ExpandMoreRoundedIcon />}
			>
				{label}
			</Button>
			<Menu
				id={id + '-menu'}
				anchorEl={anchor}
				open={open}
				onClose={controls.menuIconCloseHandler}
				TransitionComponent={Fade}
				PaperProps={{ className: 'admin-users-menu' }}
				MenuListProps={{ 'aria-labelledby': id }}
			>
				{choices.map((value) => (
					<MenuItem
						key={value}
						disabled={controls.pending}
						onClick={() =>
							controls.updateMemberHandler(
								role
									? { _id: member._id, memberType: value as MemberType }
									: { _id: member._id, memberStatus: value as MemberStatus },
							)
						}
					>
						{role ? labels.roles[value as MemberType] : labels.statuses[value as MemberStatus]}
					</MenuItem>
				))}
			</Menu>
		</>
	);
};

export const MemberPanelList = (props: MemberPanelListType) => {
	const { members } = props;
	const labels = adminUsersLabels(useRouter().locale);
	const mobile = useMediaQuery('(max-width:599px)');

	if (mobile)
		return (
			<ul className="member-mobile-list" aria-labelledby="admin-users-title">
				{!members.length && <li className="member-empty">{labels.empty}</li>}
				{members.map((member, index) => (
					<li className="member-mobile-row" key={member._id}>
						<MemberIdentity member={member} />
						<div className="member-mobile-phone">
							<span>{labels.phone}</span>
							<strong>{member.memberPhone || '—'}</strong>
						</div>
						<div className="member-mobile-actions">
							<div>
								<span>{labels.type}</span>
								<MemberControl member={member} index={index} field="memberType" labels={labels} controls={props} />
							</div>
							<div>
								<span>{labels.state}</span>
								<MemberControl member={member} index={index} field="memberStatus" labels={labels} controls={props} />
							</div>
						</div>
						<MemberDetails member={member} labels={labels} />
					</li>
				))}
			</ul>
		);
	return (
		<TableContainer className="member-table-container">
			<Table className="member-table" aria-labelledby="admin-users-title">
				<TableHead>
					<TableRow>
						<TableCell className="member-column">{labels.member}</TableCell>
						<TableCell className="phone-column">{labels.phone}</TableCell>
						<TableCell className="type-column">{labels.type}</TableCell>
						<TableCell className="state-column">{labels.state}</TableCell>
						<TableCell className="member-desktop-count">{labels.warnings}</TableCell>
						<TableCell className="member-desktop-count">{labels.blocks}</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{!members.length && (
						<TableRow>
							<TableCell colSpan={6} className="member-empty">
								{labels.empty}
							</TableCell>
						</TableRow>
					)}
					{members.map((member, index) => (
						<TableRow key={member._id}>
							<TableCell component="th" scope="row">
								<div className="member-cell-content">
									<MemberIdentity member={member} />
									<MemberDetails member={member} labels={labels} />
								</div>
							</TableCell>
							<TableCell className="member-phone">{member.memberPhone || '—'}</TableCell>
							<TableCell>
								<MemberControl member={member} index={index} field="memberType" labels={labels} controls={props} />
							</TableCell>
							<TableCell>
								<MemberControl member={member} index={index} field="memberStatus" labels={labels} controls={props} />
							</TableCell>
							<TableCell className="member-desktop-count">{member.memberWarnings ?? 0}</TableCell>
							<TableCell className="member-desktop-count">{member.memberBlocks ?? 0}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	);
};
