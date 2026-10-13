// header: the gate_config text (ministry, facility, organization)
export default function Footer({ header = {} }) {
  const parts = [
    header.ministry,
    header.facility,
    `${header.organization || "CISF"} Gate Management System`,
  ].filter(Boolean);
  return (
    <div className="goi-footer">
      <span>Government of India</span>
      {parts.map((p) => (
        <span key={p} className="footer-part">
          {" "}
          &nbsp;|&nbsp; {p}
        </span>
      ))}{" "}
      &nbsp;|&nbsp; <span>NIC Powered</span>
    </div>
  );
}
