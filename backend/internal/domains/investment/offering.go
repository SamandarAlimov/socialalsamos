package investment

import (
	"errors"
	"fmt"
	"strings"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/sharia"
)

var ErrInvalidOffering = errors.New("invalid investment offering")

type Structure string

const (
	StructureMudarabah  Structure = "mudarabah"
	StructureMusharakah Structure = "musharakah"
)

type ApprovedOffering struct {
	id               string
	shariaApprovalID string
	structure        Structure
	currency         finance.Currency
}

func (o ApprovedOffering) ID() string                  { return o.id }
func (o ApprovedOffering) ShariaApprovalID() string    { return o.shariaApprovalID }
func (o ApprovedOffering) Structure() Structure        { return o.structure }
func (o ApprovedOffering) Currency() finance.Currency  { return o.currency }

func ApproveMudarabahOffering(
	offeringID string,
	shariaApprovalID string,
	agency sharia.WakalahInvestmentTerms,
	underlying sharia.MudarabahTerms,
) (ApprovedOffering, error) {
	if err := validateOfferingIdentity(offeringID, shariaApprovalID); err != nil {
		return ApprovedOffering{}, err
	}
	if err := agency.Validate(); err != nil {
		return ApprovedOffering{}, fmt.Errorf("%w: wakalah: %w", ErrInvalidOffering, err)
	}
	if err := underlying.Validate(); err != nil {
		return ApprovedOffering{}, fmt.Errorf("%w: mudarabah: %w", ErrInvalidOffering, err)
	}
	if agency.InvestmentCapital != underlying.Capital {
		return ApprovedOffering{}, fmt.Errorf("%w: wakalah capital must match mudarabah rabb-al-mal capital", ErrInvalidOffering)
	}
	return ApprovedOffering{
		id:               strings.TrimSpace(offeringID),
		shariaApprovalID: strings.TrimSpace(shariaApprovalID),
		structure:        StructureMudarabah,
		currency:         underlying.Capital.Currency,
	}, nil
}

func ApproveMusharakahOffering(
	offeringID string,
	shariaApprovalID string,
	investorPoolPartnerID string,
	agency sharia.WakalahInvestmentTerms,
	underlying sharia.MusharakahTerms,
) (ApprovedOffering, error) {
	if err := validateOfferingIdentity(offeringID, shariaApprovalID); err != nil {
		return ApprovedOffering{}, err
	}
	investorPoolPartnerID = strings.TrimSpace(investorPoolPartnerID)
	if investorPoolPartnerID == "" {
		return ApprovedOffering{}, fmt.Errorf("%w: investor pool partner id is required", ErrInvalidOffering)
	}
	if err := agency.Validate(); err != nil {
		return ApprovedOffering{}, fmt.Errorf("%w: wakalah: %w", ErrInvalidOffering, err)
	}
	if err := underlying.Validate(); err != nil {
		return ApprovedOffering{}, fmt.Errorf("%w: musharakah: %w", ErrInvalidOffering, err)
	}

	var poolCapital *finance.Money
	for index := range underlying.Partners {
		partner := underlying.Partners[index]
		if partner.PartnerID == investorPoolPartnerID {
			capital := partner.Capital
			poolCapital = &capital
			break
		}
	}
	if poolCapital == nil {
		return ApprovedOffering{}, fmt.Errorf("%w: investor pool partner is not present in musharakah", ErrInvalidOffering)
	}
	if agency.InvestmentCapital != *poolCapital {
		return ApprovedOffering{}, fmt.Errorf("%w: wakalah capital must match investor pool musharakah capital", ErrInvalidOffering)
	}

	return ApprovedOffering{
		id:               strings.TrimSpace(offeringID),
		shariaApprovalID: strings.TrimSpace(shariaApprovalID),
		structure:        StructureMusharakah,
		currency:         poolCapital.Currency,
	}, nil
}

func validateOfferingIdentity(offeringID, shariaApprovalID string) error {
	if strings.TrimSpace(offeringID) == "" {
		return fmt.Errorf("%w: offering id is required", ErrInvalidOffering)
	}
	if strings.TrimSpace(shariaApprovalID) == "" {
		return fmt.Errorf("%w: Sharia approval id is required", ErrInvalidOffering)
	}
	return nil
}
