SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict SHcvdYWh9iDPLT7PR5aua9P1EE19zdhPtXTivCseeO551JxQktgh1RcYPvQ0HQo

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: test_connection; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."test_connection" ("id", "name") OVERRIDING SYSTEM VALUE VALUES
	(1, 'ok');


--
-- Data for Name: videos; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."videos" ("id", "title", "description", "category", "storage_path", "public_url", "created_at") VALUES
	('70413991-057a-4e37-a0db-380b609879bb', 'Daronne de rue', 'Bondage et cuir', 'Rituel', '1775402412597-daronne-de-rue.mp4', 'https://yogctjmoshqxaqwttcsd.supabase.co/storage/v1/object/public/videos/1775402412597-daronne-de-rue.mp4', '2026-04-05 15:20:21.420687+00'),
	('f08c03ab-ee0f-44d1-bf21-d613d03240cd', 'Il ne s''arretera pas là', 'Tous ignorais', 'Obscur', 'obscur/1775403841957-il-ne-s-arretera-pas-la.mp4', 'https://yogctjmoshqxaqwttcsd.supabase.co/storage/v1/object/public/videos/obscur/1775403841957-il-ne-s-arretera-pas-la.mp4', '2026-04-05 15:44:31.124903+00'),
	('bc86fa8f-18b2-416c-b42f-c3001a898647', 'Hélicoptère', 'Rituel de l’hélicoptère', 'Rituel', 'rituel/1777895142834-helicoptere.mp4', 'https://yogctjmoshqxaqwttcsd.supabase.co/storage/v1/object/public/videos/rituel/1777895142834-helicoptere.mp4', '2026-05-04 11:45:46.527189+00');


--
-- Name: test_connection_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."test_connection_id_seq"', 1, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict SHcvdYWh9iDPLT7PR5aua9P1EE19zdhPtXTivCseeO551JxQktgh1RcYPvQ0HQo

RESET ALL;
