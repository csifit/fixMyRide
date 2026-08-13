import Link from "next/link";

type PublicProviderMenuProps = {
  labels: {
    menu: string;
    serviceOrganisation: string;
    workshop: string;
    signIn: string;
    register: string;
    invitationOnly: string;
  };
};

export default function PublicProviderMenu({ labels }: PublicProviderMenuProps) {
  return <details className="public-provider-menu">
    <summary>{labels.menu}<span aria-hidden="true">⌄</span></summary>
    <div className="public-provider-options">
      <section>
        <strong>{labels.serviceOrganisation}</strong>
        <div>
          <Link href="/service-organisation/login">{labels.signIn}</Link>
          <Link href="/register/workshop-manager">{labels.register}</Link>
        </div>
      </section>
      <section>
        <strong>{labels.workshop}</strong>
        <small>{labels.invitationOnly}</small>
        <Link href="/workshop-manager/login">{labels.signIn}</Link>
      </section>
    </div>
  </details>;
}
