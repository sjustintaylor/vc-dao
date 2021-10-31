// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract VCDAO {
    /// State
    struct Proposal {
        address payable recipient;
        uint256 amountRequested;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 proposalExpiry;
        Status state;
    }

    enum Status {
        Unprocessed,
        Processed,
        Expended
    }

    enum Vote {
        Null,
        Yes,
        No
    }

    // 7 days
    uint256 public constant VOTING_PERIOD = 604800;

    // User => number of shares they hold
    mapping(address => uint256) public memberShares;

    // Proposal id => Member => whether they voted or not
    mapping(uint256 => mapping(address => bool)) public memberVotes;

    // Proposal id => proposal data
    Proposal[] public proposals;

    /// Events
    event NewProposal(
        uint256 indexed proposalId,
        address indexed recipient,
        uint256 indexed amountRequested
    );

    event ProcessProposal(
        uint256 indexed proposalId,
        Vote indexed outcome,
        uint256 indexed winningCount
    );

    event CastVote(
        uint256 indexed proposalId,
        Vote indexed vote,
        address indexed voter
    );

    event WithdrawFunds(address indexed recipient, uint256 indexed amount);

    /// Functions
    constructor(address[] memory founders) payable {
        // Issue equal shares to founders
        for (uint256 i = 0; i < founders.length; i++) {
            memberShares[founders[i]] += msg.value / founders.length;
        }
    }

    function createProposal(address payable recipient, uint256 amount)
        external
        payable
    {
        require(recipient != address(0), "invalid recipient");
        require(address(this).balance >= amount, "insufficient funds");

        proposals.push(
            Proposal(
                recipient,
                amount,
                0,
                0,
                block.timestamp + VOTING_PERIOD,
                Status.Unprocessed
            )
        );

        emit NewProposal(proposals.length - 1, recipient, amount);
    }

    function processProposal(uint256 proposalId) external {
        require(
            proposals[proposalId].proposalExpiry > block.timestamp,
            "proposal still live"
        );
        require(
            proposals[proposalId].state == Status.Unprocessed,
            "already processed"
        );
        Proposal memory proposal = proposals[proposalId];
        proposals[proposalId].state = Status.Processed;

        if (proposal.noVotes == proposal.yesVotes) {
            emit ProcessProposal(proposalId, Vote.Null, 0);
        } else {
            if (proposal.yesVotes > proposal.noVotes) {
                memberShares[proposal.recipient] += proposal.amountRequested;
                emit ProcessProposal(proposalId, Vote.Yes, proposal.yesVotes);
            } else {
                emit ProcessProposal(proposalId, Vote.No, proposal.noVotes);
            }
        }
    }

    function castVote(uint256 proposalId, Vote vote) external {
        require(memberShares[msg.sender] > 0, "not a member");
        require(!memberVotes[proposalId][msg.sender], "already voted");
        require(vote == Vote.Yes || vote == Vote.No, "invalid vote");
        require(
            proposals[proposalId].proposalExpiry <= block.timestamp,
            "proposal expired"
        );

        memberVotes[proposalId][msg.sender] = true;

        if (vote == Vote.Yes) {
            proposals[proposalId].yesVotes++;
        } else {
            proposals[proposalId].noVotes++;
        }

        emit CastVote(proposalId, vote, msg.sender);
    }

    function withdrawFunds(uint256 proposalId) external {
        Proposal memory proposal = proposals[proposalId];
        require(proposal.state == Status.Processed, "unfinished proposal");
        require(msg.sender == proposal.recipient, "invalid user");

        proposals[proposalId].state = Status.Expended;
        memberShares[msg.sender] -= proposal.amountRequested;

        emit WithdrawFunds(proposal.recipient, proposal.amountRequested);

        proposal.recipient.transfer(proposal.amountRequested);
    }
}
