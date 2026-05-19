import { Studio } from "./Studio";

type StudioPageProps = {
  params: Promise<{ query_id: string }>;
};

const StudioPage = async ({ params }: StudioPageProps) => {
  const { query_id } = await params;

  return <Studio queryId={query_id} />;
};

export default StudioPage;
