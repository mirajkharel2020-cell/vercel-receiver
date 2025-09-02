export default function Page({ d }) {
  console.log("Received d:", d); // ✅ This will appear in Vercel logs

  return (
    <div>
      <h1>Receiver Online ✅</h1>
      <p>Received: {d}</p>
    </div>
  );
}

export async function getServerSideProps(context) {
  const { d } = context.query;
  console.log("Received d:", d); // logs appear here too
  return { props: { d: d || null } };
}
