/**
 * Telefones dos centros de informação toxicológica, exatamente como no ANY
 * (banner da tela inicial do ToxPath e "Outros contatos"). A validade dos
 * números é conferida na revisão clínica (CC-310): o Copiloto não tem como
 * saber se mudaram.
 */
export interface PoisonCenterContact {
  id: 'disque-intoxicacao' | 'ciatox-go';
  name: string;
  /** Linha de apoio abaixo do nome. */
  description: string;
  /** Número como o médico lê ("0800 722 6001"). */
  phone: string;
}

/** Disque-Intoxicação: o número do banner e de todos os "ligar" do roteiro. */
export const DISQUE_INTOXICACAO: PoisonCenterContact = {
  id: 'disque-intoxicacao',
  name: 'Disque-Intoxicação',
  description: 'Plantão 24h para profissionais de saúde',
  phone: '0800 722 6001',
};

/** CIATox de Goiás, em "Outros contatos" no ANY. */
export const CIATOX_GO: PoisonCenterContact = {
  id: 'ciatox-go',
  name: 'CIATox Goiás',
  description: 'Centro de Informação e Assistência Toxicológica de Goiás',
  phone: '0800 646 4350',
};

export const POISON_CENTER_CONTACTS: readonly PoisonCenterContact[] = [
  DISQUE_INTOXICACAO,
  CIATOX_GO,
];

/** Endereço `tel:` do contato, só com os dígitos ("tel:08007226001", como no ANY). */
export function telHref(contact: PoisonCenterContact): string {
  return `tel:${contact.phone.replace(/\D/g, '')}`;
}
